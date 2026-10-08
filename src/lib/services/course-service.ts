/**
 * Course Service — pure business logic, no auth, no revalidation.
 * Called by server actions (NextAuth) and agent API routes (API key).
 */

import { db } from "@/lib/db";
import { courses, chapters, lessons, planContents, planCourses, plans, userPurchases } from "@/lib/db/schema";
import { count, eq, and, isNull, inArray } from "drizzle-orm";
import { writeAuditLog, computeChanges } from "@/lib/audit";
import { createRevision } from "@/lib/versioning";
import { orphanMediaByEntity } from "@/lib/media-cleanup";
import { bindMediaAssetsFromContent } from "@/lib/media-assets";
import {
  normalizeLessonContent,
  parseLessonResources,
  serializeLessonResources,
  type LessonContentType,
  type LessonResource,
} from "@/lib/lesson-content";

// ─── Input Limits ───

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CONTENT_LENGTH = 100000;

function validateLengths(fields: Record<string, { value: string | null | undefined; max: number; label: string }>) {
  for (const [, { value, max, label }] of Object.entries(fields)) {
    if (value && value.length > max) {
      throw new Error(`${label}不能超過 ${max} 個字元（目前 ${value.length}）`);
    }
  }
}

function lessonMediaBindingContent(content: string, resources: LessonResource[]) {
  return `${content}\n${JSON.stringify(resources)}`;
}

// ─── Types ───

interface Actor {
  type: "user" | "agent" | "system";
  id: string;
  name?: string;
}

interface CreateCourseInput {
  planId?: string; // optional — course is independent, linked via planCourses
  title: string;
  description?: string | null;
}

interface UpdateCourseInput {
  title: string;
  description?: string | null;
}

interface CreateChapterInput {
  courseId: string;
  title: string;
  sortOrder?: number;
}

interface UpdateChapterInput {
  title?: string;
  sortOrder?: number;
  defaultExpanded?: boolean;
}

interface CreateLessonInput {
  courseId: string;
  chapterId: string;
  title: string;
  type: LessonContentType;
  content: string;
  resourcesJson?: unknown;
  duration?: number | null;
  isPreview?: boolean;
  sortOrder?: number;
}

interface UpdateLessonInput {
  title?: string;
  type?: LessonContentType;
  content?: string;
  resourcesJson?: unknown;
  chapterId?: string;
  duration?: number | null;
  isPreview?: boolean;
  sortOrder?: number;
  status?: "draft" | "published";
}

export type { Actor, CreateCourseInput, UpdateCourseInput, CreateChapterInput, UpdateChapterInput, CreateLessonInput, UpdateLessonInput };

export class CourseDeletionBlockedError extends Error {
  readonly code = "COURSE_HAS_ACTIVE_PURCHASES";

  constructor() {
    super("無法刪除已發佈且有用戶購買的課程。請先將課程設為「已封存」，或撤銷所有用戶的存取權限。");
    this.name = "CourseDeletionBlockedError";
  }
}

export function assertLessonLifecycleTransition(
  currentStatus: "draft" | "published",
  nextStatus: "draft" | "published" | undefined,
) {
  if (currentStatus === "draft" && nextStatus === "published") {
    throw new Error("Draft lessons can only be published through the course bundle coordinator");
  }
}

// ─── Helpers ───

async function refreshPlatformContentFlag(planId: string) {
  const [[courseCount], [contentCount]] = await Promise.all([
    db.select({ value: count() }).from(planCourses)
      .innerJoin(courses, eq(planCourses.courseId, courses.id))
      .where(
        and(eq(planCourses.planId, planId), isNull(planCourses.removedAt), isNull(courses.deletedAt)),
      ),
    db.select({ value: count() }).from(planContents).where(
      and(eq(planContents.planId, planId), isNull(planContents.deletedAt)),
    ),
  ]);

  await db
    .update(plans)
    .set({ hasPlatformContent: (courseCount?.value ?? 0) + (contentCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

// ─── Course ───

export async function createCourse(input: CreateCourseInput, actor: Actor) {
  validateLengths({
    title: { value: input.title, max: MAX_TITLE_LENGTH, label: "課程名稱" },
    description: { value: input.description, max: MAX_DESCRIPTION_LENGTH, label: "課程說明" },
  });

  if (input.planId) {
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, input.planId),
      columns: { id: true },
    });
    if (!plan) throw new Error("Plan not found");
  }

  const [course] = await db
    .insert(courses)
    .values({
      title: input.title,
      description: input.description || null,
      status: "draft",
    })
    .returning({ id: courses.id });

  if (!course) throw new Error("Failed to create course");

  // If planId provided, also create junction table entry
  if (input.planId) {
    await db.insert(planCourses).values({
      planId: input.planId,
      courseId: course.id,
    }).onConflictDoNothing();

    await db
      .update(plans)
      .set({ hasPlatformContent: true })
      .where(eq(plans.id, input.planId));
  }

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "create",
    entityType: "course",
    entityId: course.id,
    metadata: { planId: input.planId ?? null, title: input.title },
  });

  return course;
}

export async function updateCourse(courseId: string, input: UpdateCourseInput, actor: Actor) {
  validateLengths({
    title: { value: input.title, max: MAX_TITLE_LENGTH, label: "課程名稱" },
    description: { value: input.description, max: MAX_DESCRIPTION_LENGTH, label: "課程說明" },
  });

  const before = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!before) throw new Error("Course not found");

  await createRevision("course", courseId, before as unknown as Record<string, unknown>, actor.id);

  await db
    .update(courses)
    .set({
      title: input.title,
      description: input.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));

  const changes = computeChanges(
    { title: before.title, description: before.description },
    { title: input.title, description: input.description ?? null },
  );

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "update",
    entityType: "course",
    entityId: courseId,
    changes,
  });
}

export async function deleteCourse(courseId: string, actor: Actor) {
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });

  // Guardrail: block deletion of published courses with active purchases
  if (course && course.status === "published") {
    // Find all plans this course is linked to
    const linkedPlans = await db
      .select({ planId: planCourses.planId })
      .from(planCourses)
      .where(and(eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)));

    const linkedPlanIds = linkedPlans.map((p) => p.planId);
    if (linkedPlanIds.length > 0) {
      const [purchaseCount] = await db
        .select({ value: count() })
        .from(userPurchases)
        .where(and(inArray(userPurchases.planId, linkedPlanIds), isNull(userPurchases.revokedAt)));

      if ((purchaseCount?.value ?? 0) > 0) {
        throw new CourseDeletionBlockedError();
      }
    }
  }

  await db
    .update(courses)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(eq(courses.id, courseId));

  await db
    .update(chapters)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)));

  await db
    .update(lessons)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)));

  if (course) {
    // Refresh platform content flag for all linked plans
    const linkedPlans = await db
      .select({ planId: planCourses.planId })
      .from(planCourses)
      .where(eq(planCourses.courseId, courseId));
    for (const lp of linkedPlans) {
      await refreshPlatformContentFlag(lp.planId);
    }

    await orphanMediaByEntity("course", courseId);

    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: "delete",
      entityType: "course",
      entityId: courseId,
      metadata: { title: course.title },
    });
  }
}

export async function restoreCourse(courseId: string, actor: Actor) {
  await db
    .update(courses)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(courses.id, courseId));

  await db
    .update(chapters)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(chapters.courseId, courseId));

  await db
    .update(lessons)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(lessons.courseId, courseId));

  // Refresh platform content flag for all linked plans
  const linkedPlans = await db
    .select({ planId: planCourses.planId })
    .from(planCourses)
    .where(eq(planCourses.courseId, courseId));
  for (const lp of linkedPlans) {
    await refreshPlatformContentFlag(lp.planId);
  }

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "restore",
    entityType: "course",
    entityId: courseId,
  });
}

export async function archiveCourseStatus(courseId: string, actor: Actor) {
  const before = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
    columns: { status: true },
  });
  if (!before) throw new Error("Course not found");

  await db
    .update(courses)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "update",
    entityType: "course",
    entityId: courseId,
    changes: { status: { before: before.status, after: "archived" } },
  });
}

export async function unarchiveCourseStatus(courseId: string, actor: Actor) {
  const before = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
    columns: { status: true },
  });
  if (!before) throw new Error("Course not found");

  await db
    .update(courses)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "update",
    entityType: "course",
    entityId: courseId,
    changes: { status: { before: before.status, after: "draft" } },
    metadata: actor.type === "agent" && actor.name ? { agentName: actor.name } : undefined,
  });
}

export async function restoreChapter(chapterId: string, actor: Actor) {
  await db
    .update(chapters)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(chapters.id, chapterId));

  // Restore child lessons
  await db
    .update(lessons)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(lessons.chapterId, chapterId));

  // Refresh platform content flag for linked plans
  const chapter = await db.query.chapters.findFirst({
    where: eq(chapters.id, chapterId),
  });
  if (chapter) {
    const linkedPlans = await db
      .select({ planId: planCourses.planId })
      .from(planCourses)
      .where(eq(planCourses.courseId, chapter.courseId));
    for (const lp of linkedPlans) {
      await refreshPlatformContentFlag(lp.planId);
    }
  }

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "restore",
    entityType: "chapter",
    entityId: chapterId,
  });
}

export async function restoreLesson(lessonId: string, actor: Actor) {
  await db
    .update(lessons)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(lessons.id, lessonId));

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "restore",
    entityType: "lesson",
    entityId: lessonId,
  });
}

// ─── Chapter ───

export async function createChapter(input: CreateChapterInput, actor: Actor) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, input.courseId), isNull(courses.deletedAt)),
    columns: { id: true },
  });
  if (!course) throw new Error("Course not found");

  const [chapter] = await db
    .insert(chapters)
    .values({
      courseId: input.courseId,
      title: input.title,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning({ id: chapters.id });

  if (!chapter) throw new Error("Failed to create chapter");

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "create",
    entityType: "chapter",
    entityId: chapter.id,
    metadata: { courseId: input.courseId, title: input.title },
  });

  return chapter;
}

export async function updateChapter(chapterId: string, input: UpdateChapterInput, actor: Actor) {
  const before = await db.query.chapters.findFirst({
    where: eq(chapters.id, chapterId),
  });

  const nextTitle = input.title ?? before?.title;
  const nextSortOrder = input.sortOrder ?? before?.sortOrder ?? 0;
  const nextDefaultExpanded =
    input.defaultExpanded ?? before?.defaultExpanded ?? false;

  await db
    .update(chapters)
    .set({
      title: nextTitle,
      sortOrder: nextSortOrder,
      defaultExpanded: nextDefaultExpanded,
      updatedAt: new Date(),
    })
    .where(eq(chapters.id, chapterId));

  if (before) {
    const changes = computeChanges(
      {
        title: before.title,
        sortOrder: before.sortOrder,
        defaultExpanded: before.defaultExpanded,
      },
      {
        title: nextTitle,
        sortOrder: nextSortOrder,
        defaultExpanded: nextDefaultExpanded,
      },
    );
    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: "update",
      entityType: "chapter",
      entityId: chapterId,
      changes,
    });
  }
}

export async function deleteChapter(chapterId: string, actor: Actor) {
  const chapter = await db.query.chapters.findFirst({
    where: eq(chapters.id, chapterId),
  });

  await db
    .update(chapters)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(eq(chapters.id, chapterId));

  await db
    .update(lessons)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(and(eq(lessons.chapterId, chapterId), isNull(lessons.deletedAt)));

  if (chapter) {
    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: "delete",
      entityType: "chapter",
      entityId: chapterId,
      metadata: { courseId: chapter.courseId, title: chapter.title },
    });

    // Refresh platform content flag for all plans linked to this course
    const linkedPlans = await db
      .select({ planId: planCourses.planId })
      .from(planCourses)
      .where(eq(planCourses.courseId, chapter.courseId));
    for (const lp of linkedPlans) {
      await refreshPlatformContentFlag(lp.planId);
    }
  }
}

// ─── Lesson ───

export async function createLesson(input: CreateLessonInput, actor: Actor) {
  validateLengths({
    title: { value: input.title, max: MAX_TITLE_LENGTH, label: "課堂標題" },
    content: { value: input.content, max: MAX_CONTENT_LENGTH, label: "課堂內容" },
  });
  const resourcesJson = serializeLessonResources(input.resourcesJson ?? []);
  const normalizedContent = normalizeLessonContent(input.type, input.content);

  const chapter = await db.query.chapters.findFirst({
    where: and(
      eq(chapters.id, input.chapterId),
      eq(chapters.courseId, input.courseId),
      isNull(chapters.deletedAt),
    ),
    columns: { id: true },
  });
  if (!chapter) throw new Error("Chapter does not belong to course");

  const [lesson] = await db
    .insert(lessons)
    .values({
      courseId: input.courseId,
      chapterId: input.chapterId,
      title: input.title,
      type: input.type,
      content: normalizedContent,
      resourcesJson,
      duration: input.duration ?? null,
      isPreview: input.isPreview ?? false,
      sortOrder: input.sortOrder ?? 0,
      status: "draft",
    })
    .returning({ id: lessons.id });

  if (!lesson) throw new Error("Failed to create lesson");

  await bindMediaAssetsFromContent(
    lessonMediaBindingContent(normalizedContent, resourcesJson),
    "lesson",
    lesson.id,
  );

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "create",
    entityType: "lesson",
    entityId: lesson.id,
    metadata: {
      courseId: input.courseId,
      chapterId: input.chapterId,
      title: input.title,
      type: input.type,
      resourceCount: resourcesJson.length,
    },
  });

  return lesson;
}

export async function updateLesson(lessonId: string, input: UpdateLessonInput, actor: Actor) {
  validateLengths({
    title: { value: input.title, max: MAX_TITLE_LENGTH, label: "課堂標題" },
    content: { value: input.content, max: MAX_CONTENT_LENGTH, label: "課堂內容" },
  });

  const before = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });
  if (!before) throw new Error("Lesson not found");
  assertLessonLifecycleTransition(before.status, input.status);
  const beforeResources = parseLessonResources(before.resourcesJson);
  const nextType = (input.type ?? before.type) as LessonContentType;
  const nextContent = normalizeLessonContent(nextType, input.content ?? before.content);
  const nextResources =
    input.resourcesJson !== undefined
      ? serializeLessonResources(input.resourcesJson)
      : beforeResources;

  if (input.chapterId !== undefined) {
    const chapter = await db.query.chapters.findFirst({
      where: and(
        eq(chapters.id, input.chapterId),
        eq(chapters.courseId, before.courseId),
        isNull(chapters.deletedAt),
      ),
      columns: { id: true },
    });
    if (!chapter) throw new Error("Chapter does not belong to course");
  }

  await createRevision("lesson", lessonId, before as unknown as Record<string, unknown>, actor.id);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) updateData.title = input.title;
  if (input.type !== undefined) updateData.type = nextType;
  if (input.content !== undefined || input.type !== undefined) updateData.content = nextContent;
  if (input.resourcesJson !== undefined) updateData.resourcesJson = nextResources;
  if (input.chapterId !== undefined) updateData.chapterId = input.chapterId;
  if (input.duration !== undefined) updateData.duration = input.duration;
  if (input.isPreview !== undefined) updateData.isPreview = input.isPreview;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
  if (input.status !== undefined) updateData.status = input.status;

  await db
    .update(lessons)
    .set(updateData)
    .where(eq(lessons.id, lessonId));

  if (input.content !== undefined || input.type !== undefined || input.resourcesJson !== undefined) {
    await bindMediaAssetsFromContent(
      lessonMediaBindingContent(nextContent, nextResources),
      "lesson",
      lessonId,
    );
  }

  const changes = computeChanges(
    {
      title: before.title,
      content: before.content,
      type: before.type,
      status: before.status,
      resourcesJson: beforeResources,
    },
    {
      title: input.title ?? before.title,
      content: nextContent,
      type: nextType,
      status: input.status ?? before.status,
      resourcesJson: nextResources,
    },
  );

  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "update",
    entityType: "lesson",
    entityId: lessonId,
    changes,
  });
}

export async function deleteLesson(lessonId: string, actor: Actor) {
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });

  await db
    .update(lessons)
    .set({ deletedAt: new Date(), deletedBy: actor.id })
    .where(eq(lessons.id, lessonId));

  if (lesson) {
    await orphanMediaByEntity("lesson", lessonId);
    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: "delete",
      entityType: "lesson",
      entityId: lessonId,
      metadata: { courseId: lesson.courseId, title: lesson.title },
    });
  }
}
