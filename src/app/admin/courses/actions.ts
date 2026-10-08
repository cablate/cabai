"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { courses, planCourses, chapters, lessons, planContents, plans } from "@/lib/db/schema";
import { count, eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { writeAuditLog, computeChanges } from "@/lib/audit";
import { createRevision } from "@/lib/versioning";
import { orphanMediaByEntity } from "@/lib/media-cleanup";
import { bindMediaAssetsFromContent } from "@/lib/media-assets";
import {
  normalizeLessonContent,
  serializeLessonResources,
  type LessonContentType,
  type LessonResource,
} from "@/lib/lesson-content";
import { publishCourseInformationBundle } from "@/lib/services/publication-bundle-service";
import {
  reorderCourseOutline as reorderCourseOutlineService,
  type CourseOutlineInput,
  type CourseOutlineResult,
} from "@/lib/course-outline";
import {
  CourseDeletionBlockedError,
  assertLessonLifecycleTransition,
  archiveCourseStatus as archiveCourseStatusService,
  createCourse as createCourseService,
  deleteCourse as deleteCourseService,
  restoreCourse as restoreCourseService,
  updateCourse as updateCourseService,
} from "@/lib/services/course-service";

// ─── Helpers ───

async function getLinkedPlanIds(courseId: string): Promise<string[]> {
  const rows = await db
    .select({ planId: planCourses.planId })
    .from(planCourses)
    .where(and(eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)));
  return rows.map((r) => r.planId);
}

async function revalidateLinkedPlans(courseId: string) {
  const planIds = await getLinkedPlanIds(courseId);
  for (const pid of planIds) {
    revalidatePath(`/admin/plans/${pid}`);
    revalidatePath(`/admin/products/${pid}/delivery`);
    revalidatePath(`/products/${pid}`);
  }
}

async function refreshLinkedPlanFlags(courseId: string) {
  const planIds = await getLinkedPlanIds(courseId);
  for (const pid of planIds) {
    await refreshPlatformContentFlag(pid);
  }
}

const lessonContentTypes = ["video", "text", "pdf", "download"] as const;

function parseLessonResourcesFormValue(value: FormDataEntryValue | null): LessonResource[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    return serializeLessonResources(JSON.parse(value));
  } catch {
    return [];
  }
}

function lessonMediaBindingContent(content: string, resources: LessonResource[]) {
  return `${content}\n${JSON.stringify(resources)}`;
}

// ─── Schemas ───

const createCourseSchema = z.object({
  planId: z.string().min(1, "請選擇方案"),
  title: z.string().min(1, "課程名稱必填"),
  description: z.string().optional(),
});

const createLessonSchema = z.object({
  courseId: z.string().min(1),
  chapterId: z.string().min(1, "請選擇章節"),
  title: z.string().min(1, "標題必填"),
  type: z.enum(lessonContentTypes, {
    required_error: "請選擇類型",
  }),
  content: z.string().min(1, "內容必填"),
  resourcesJson: z.array(z.unknown()).transform(serializeLessonResources).default([]),
  duration: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().positive("時長必須大於 0").nullable()),
  isPreview: z.boolean().default(false),
  sortOrder: z
    .string()
    .optional()
    .transform((v) => Number(v || "0")),
});

const createChapterSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1, "章節名稱必填"),
  sortOrder: z
    .string()
    .optional()
    .transform((v) => Number(v || "0")),
});

// ─── Result types ───

export type CourseActionResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
  courseId?: string;
} | null;

export type LessonActionResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
  status?: "saved" | "conflict" | "failed";
  version?: string;
} | null;

export type ChapterActionResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
  chapterId?: string;
} | null;

async function refreshPlatformContentFlag(planId: string) {
  const [[courseCount], [contentCount]] = await Promise.all([
    db.select({ value: count() }).from(planCourses)
      .innerJoin(courses, eq(planCourses.courseId, courses.id))
      .where(and(eq(planCourses.planId, planId), isNull(planCourses.removedAt), isNull(courses.deletedAt))),
    db.select({ value: count() }).from(planContents).where(
      and(eq(planContents.planId, planId), isNull(planContents.deletedAt)),
    ),
  ]);

  await db
    .update(plans)
    .set({ hasPlatformContent: (courseCount?.value ?? 0) + (contentCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

// ─── Course Actions ───

export async function createCourse(
  _prev: CourseActionResult,
  formData: FormData,
): Promise<CourseActionResult> {
  const session = await requireAdminAction("course:create");

  const parsed = createCourseSchema.safeParse({
    planId: formData.get("planId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { planId, title, description } = parsed.data;

  const course = await createCourseService(
    { planId, title, description: description || null },
    { type: "user", id: session.user.id },
  );

  revalidatePath("/admin/courses");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${planId}/delivery`);
  revalidatePath(`/products/${planId}`);
  return { success: true, courseId: course.id };
}

export async function updateCourse(courseId: string, formData: FormData) {
  const session = await requireAdminAction("course:update");

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;

  if (!title) return { error: "標題必填" };

  try {
    await updateCourseService(
      courseId,
      { title, description: description || null },
      { type: "user", id: session.user.id },
    );

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    return { success: true };
  } catch (err) {
    return { error: `更新失敗：${err instanceof Error ? err.message : "未知錯誤"}` };
  }
}

export async function deleteCourse(courseId: string) {
  const session = await requireAdminAction("course:delete", { heavy: true });

  try {
    await deleteCourseService(courseId, { type: "user", id: session.user.id });
  } catch (error) {
    return {
      success: false,
      error: error instanceof CourseDeletionBlockedError
        ? error.message
        : "刪除課程失敗，請稍後再試。",
    };
  }

  await revalidateLinkedPlans(courseId);
  revalidatePath("/admin/courses");
  revalidatePath("/admin/products");
  return { success: true };
}

export async function restoreCourse(courseId: string) {
  const session = await requireAdminAction("course:restore", { heavy: true });

  await restoreCourseService(courseId, { type: "user", id: session.user.id });

  revalidatePath("/admin/courses");
  await revalidateLinkedPlans(courseId);
}

export async function publishCourse(input: {
  courseId: string;
  sourceVersion: string;
  informationId: string;
  expectedInformationRevision: number;
  idempotencyKey: string;
}) {
  const session = await requireAdminAction("course:publish", { heavy: true });
  return publishCourseInformationBundle({
    ...input,
    actor: { type: "user", id: session.user.id },
  });
}

export async function reorderCourseOutline(input: CourseOutlineInput): Promise<CourseOutlineResult> {
  const session = await requireAdminAction("course:update", { heavy: true });
  const result = await reorderCourseOutlineService(input, {
    type: "user",
    id: session.user.id,
  });
  if (result.success) {
    revalidatePath(`/admin/courses/${input.courseId}`);
    await revalidateLinkedPlans(input.courseId);
  }
  return result;
}

export async function archiveCourse(courseId: string) {
  const session = await requireAdminAction("course:archive");

  await archiveCourseStatusService(courseId, { type: "user", id: session.user.id });

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
  await revalidateLinkedPlans(courseId);
  return { success: true };
}

// ─── Lesson Actions ───

export async function createLesson(
  _prev: LessonActionResult,
  formData: FormData,
): Promise<LessonActionResult> {
  const session = await requireAdminAction("lesson:create");

  const parsed = createLessonSchema.safeParse({
    courseId: formData.get("courseId"),
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
    type: formData.get("type"),
    content: formData.get("content"),
    resourcesJson: parseLessonResourcesFormValue(formData.get("resourcesJson")),
    duration: formData.get("duration") || undefined,
    isPreview: formData.get("isPreview") === "on",
    sortOrder: formData.get("sortOrder") || "0",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { courseId, chapterId, title, type, content, resourcesJson, duration, isPreview, sortOrder } =
    parsed.data;
  const normalizedContent = normalizeLessonContent(type, content);

  const chapter = await db.query.chapters.findFirst({
    where: and(
      eq(chapters.id, chapterId),
      eq(chapters.courseId, courseId),
      isNull(chapters.deletedAt),
    ),
    columns: { id: true },
  });
  if (!chapter) {
    return { error: "Invalid chapter for course" };
  }

  const [lesson] = await db.insert(lessons).values({
    courseId,
    chapterId,
    title,
    type,
    content: normalizedContent,
    resourcesJson,
    duration,
    isPreview,
    sortOrder,
    status: "draft",
  }).returning({ id: lessons.id });

  if (lesson) {
    await bindMediaAssetsFromContent(
      lessonMediaBindingContent(normalizedContent, resourcesJson),
      "lesson",
      lesson.id,
      session.user.id,
    );
  }

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "create",
    entityType: "lesson",
    entityId: lesson?.id ?? "unknown",
    metadata: { courseId, chapterId, title, type, resourceCount: resourcesJson.length },
  });

  revalidatePath(`/admin/courses/${courseId}`);
  await revalidateLinkedPlans(courseId);
  return { success: true };
}

export async function updateLesson(lessonId: string, formData: FormData) {
  const session = await requireAdminAction("lesson:update");

  const title = formData.get("title") as string;
  const parsedType = z.enum(lessonContentTypes).safeParse(formData.get("type"));
  if (!parsedType.success) {
    return { error: "Invalid lesson type" };
  }
  const type: LessonContentType = parsedType.data;
  const content = normalizeLessonContent(type, String(formData.get("content") ?? ""));
  const resourcesJson = parseLessonResourcesFormValue(formData.get("resourcesJson"));
  const chapterId = formData.get("chapterId") as string;
  const duration = formData.get("duration") as string;
  const isPreview = formData.get("isPreview") === "on";
  const sortOrder = Number(formData.get("sortOrder") || "0");
  const rawStatus = formData.get("status");
  const status = rawStatus === "published" ? "published" : rawStatus === "draft" ? "draft" : undefined;
  const expectedVersion = String(formData.get("expectedVersion") ?? "");

  try {
    const before = await db.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
    });

    if (!before) {
      return { error: "Lesson not found" };
    }

    assertLessonLifecycleTransition(before.status, status);

    if (expectedVersion && before.updatedAt.toISOString() !== expectedVersion) {
      return { success: false, status: "conflict" as const, error: "此課堂已在其他頁面更新，請重新載入後再編輯" };
    }

    if (chapterId) {
      const chapter = await db.query.chapters.findFirst({
        where: and(
          eq(chapters.id, chapterId),
          eq(chapters.courseId, before.courseId),
          isNull(chapters.deletedAt),
        ),
        columns: { id: true },
      });
      if (!chapter) {
        return { error: "Invalid chapter for course" };
      }
    }

    await createRevision("lesson", lessonId, before as unknown as Record<string, unknown>, session.user.id);

    const nextUpdatedAt = new Date();
    const updated = await db
      .update(lessons)
      .set({
        title,
        type,
        content,
        resourcesJson,
        chapterId: chapterId || undefined,
        duration: duration ? Number(duration) : null,
        isPreview,
        sortOrder,
        status: status ?? before.status,
        updatedAt: nextUpdatedAt,
      })
      .where(expectedVersion
        ? and(eq(lessons.id, lessonId), eq(lessons.updatedAt, before.updatedAt))
        : eq(lessons.id, lessonId))
      .returning({ id: lessons.id });

    if (updated.length === 0) {
      return { success: false, status: "conflict" as const, error: "此課堂已在其他頁面更新，請重新載入後再編輯" };
    }

    await bindMediaAssetsFromContent(
      lessonMediaBindingContent(content, resourcesJson),
      "lesson",
      lessonId,
      session.user.id,
    );

    if (before) {
      const changes = computeChanges(
        {
          title: before.title,
          content: before.content,
          type: before.type,
          resourcesJson: before.resourcesJson,
        },
        { title, content, type, resourcesJson },
      );
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "update",
        entityType: "lesson",
        entityId: lessonId,
        changes,
      });
    }

    if (before) {
      revalidatePath(`/admin/courses/${before.courseId}`);
      await revalidateLinkedPlans(before.courseId);
    }
    return { success: true, status: "saved" as const, version: nextUpdatedAt.toISOString() };
  } catch (err) {
    return { success: false, status: "failed" as const, error: `更新失敗：${err instanceof Error ? err.message : "未知錯誤"}` };
  }
}

export async function deleteLesson(lessonId: string) {
  const session = await requireAdminAction("lesson:delete");

  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });

  // Soft delete
  await db
    .update(lessons)
    .set({ deletedAt: new Date(), deletedBy: session.user.id })
    .where(eq(lessons.id, lessonId));

  if (lesson) {
    await orphanMediaByEntity("lesson", lessonId);

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "delete",
      entityType: "lesson",
      entityId: lessonId,
      metadata: { courseId: lesson.courseId, title: lesson.title },
    });

    revalidatePath(`/admin/courses/${lesson.courseId}`);
    await revalidateLinkedPlans(lesson.courseId);
  }
}

export async function restoreLesson(lessonId: string) {
  const session = await requireAdminAction("lesson:restore");

  await db
    .update(lessons)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(lessons.id, lessonId));

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "restore",
    entityType: "lesson",
    entityId: lessonId,
  });

  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });
  if (lesson) {
    revalidatePath(`/admin/courses/${lesson.courseId}`);
  }
}

// ─── Chapter Actions ───

export async function createChapter(
  _prev: ChapterActionResult,
  formData: FormData,
): Promise<ChapterActionResult> {
  const session = await requireAdminAction("chapter:create");

  const parsed = createChapterSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    sortOrder: formData.get("sortOrder") || "0",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { courseId, title, sortOrder } = parsed.data;

  const [chapter] = await db
    .insert(chapters)
    .values({ courseId, title, sortOrder })
    .returning({ id: chapters.id });

  if (!chapter) {
    return { success: false, error: "Failed to create chapter" };
  }

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "create",
    entityType: "chapter",
    entityId: chapter.id,
    metadata: { courseId, title },
  });

  revalidatePath(`/admin/courses/${courseId}`);
  return { success: true, chapterId: chapter.id };
}

export async function updateChapter(chapterId: string, formData: FormData) {
  const session = await requireAdminAction("chapter:update");

  const title = formData.get("title") as string;
  if (!title) return { error: "章節名稱必填" };

  const sortOrder = Number(formData.get("sortOrder") || "0");

  try {
    const before = await db.query.chapters.findFirst({
      where: eq(chapters.id, chapterId),
    });

    await db
      .update(chapters)
      .set({ title, sortOrder, updatedAt: new Date() })
      .where(eq(chapters.id, chapterId));

    if (before) {
      const changes = computeChanges(
        { title: before.title, sortOrder: before.sortOrder },
        { title, sortOrder },
      );
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "update",
        entityType: "chapter",
        entityId: chapterId,
        changes,
      });
      revalidatePath(`/admin/courses/${before.courseId}`);
    }
    return { success: true };
  } catch (err) {
    return { error: `更新失敗：${err instanceof Error ? err.message : "未知錯誤"}` };
  }
}

export async function deleteChapter(chapterId: string) {
  const session = await requireAdminAction("chapter:delete");

  const chapter = await db.query.chapters.findFirst({
    where: eq(chapters.id, chapterId),
  });

  // Soft delete chapter and its lessons
  await db
    .update(chapters)
    .set({ deletedAt: new Date(), deletedBy: session.user.id })
    .where(eq(chapters.id, chapterId));

  await db
    .update(lessons)
    .set({ deletedAt: new Date(), deletedBy: session.user.id })
    .where(and(eq(lessons.chapterId, chapterId), isNull(lessons.deletedAt)));

  if (chapter) {
    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "delete",
      entityType: "chapter",
      entityId: chapterId,
      metadata: { courseId: chapter.courseId, title: chapter.title },
    });

    revalidatePath(`/admin/courses/${chapter.courseId}`);
    await refreshLinkedPlanFlags(chapter.courseId);
    await revalidateLinkedPlans(chapter.courseId);
  }
}

export async function restoreChapter(chapterId: string) {
  const session = await requireAdminAction("chapter:restore");

  await db
    .update(chapters)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(chapters.id, chapterId));

  // Restore child lessons
  await db
    .update(lessons)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(lessons.chapterId, chapterId));

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "restore",
    entityType: "chapter",
    entityId: chapterId,
  });

  const chapter = await db.query.chapters.findFirst({
    where: eq(chapters.id, chapterId),
  });
  if (chapter) {
    revalidatePath(`/admin/courses/${chapter.courseId}`);
  }
}
