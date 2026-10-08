import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, lessons } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/audit";

export interface OutlineLessonInput {
  id: string;
}

export interface OutlineChapterInput {
  id: string;
  lessons: OutlineLessonInput[];
}

export interface CourseOutlineInput {
  courseId: string;
  expectedRevision: string;
  chapters: OutlineChapterInput[];
}

export interface CourseOutlineResult {
  success: boolean;
  status: "saved" | "invalid" | "conflict";
  revision?: string;
  error?: string;
}

export interface CourseOutlineSnapshot {
  revision: string;
  chapters: Array<{
    id: string;
    title: string;
    sortOrder: number;
    updatedAt: Date;
    lessons: Array<{
      id: string;
      chapterId: string;
      title: string;
      type: string;
      status: string;
      isPreview: boolean;
      duration: number | null;
      sortOrder: number;
      updatedAt: Date;
    }>;
  }>;
}

type OutlineRows = {
  chapters: Array<{ id: string; sortOrder: number; updatedAt: Date }>;
  lessons: Array<{ id: string; chapterId: string; sortOrder: number; updatedAt: Date }>;
};

export function computeCourseOutlineRevision(rows: OutlineRows): string {
  const serialized = [
    ...rows.chapters
      .map((chapter) => `chapter:${chapter.id}:${chapter.sortOrder}:${chapter.updatedAt.toISOString()}`)
      .sort(),
    ...rows.lessons
      .map((lesson) => `lesson:${lesson.id}:${lesson.chapterId}:${lesson.sortOrder}:${lesson.updatedAt.toISOString()}`)
      .sort(),
  ].join("\n");
  return createHash("sha256").update(serialized).digest("hex");
}

export async function getCourseOutlineSnapshot(courseId: string): Promise<CourseOutlineSnapshot> {
  const [chapterRows, lessonRows] = await Promise.all([
    db
      .select({
        id: chapters.id,
        title: chapters.title,
        sortOrder: chapters.sortOrder,
        updatedAt: chapters.updatedAt,
      })
      .from(chapters)
      .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder), asc(chapters.id)),
    db
      .select({
        id: lessons.id,
        chapterId: lessons.chapterId,
        title: lessons.title,
        type: lessons.type,
        status: lessons.status,
        isPreview: lessons.isPreview,
        duration: lessons.duration,
        sortOrder: lessons.sortOrder,
        updatedAt: lessons.updatedAt,
      })
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.sortOrder), asc(lessons.id)),
  ]);

  return {
    revision: computeCourseOutlineRevision({ chapters: chapterRows, lessons: lessonRows }),
    chapters: chapterRows.map((chapter) => ({
      ...chapter,
      lessons: lessonRows.filter((lesson) => lesson.chapterId === chapter.id),
    })),
  };
}

function validateCompleteOutline(input: CourseOutlineInput, rows: OutlineRows): string | null {
  const submittedChapterIds = input.chapters.map((chapter) => chapter.id);
  const submittedLessonIds = input.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id));
  const uniqueChapterIds = new Set(submittedChapterIds);
  const uniqueLessonIds = new Set(submittedLessonIds);

  if (uniqueChapterIds.size !== submittedChapterIds.length || uniqueLessonIds.size !== submittedLessonIds.length) {
    return "課綱包含重複項目";
  }
  if (
    uniqueChapterIds.size !== rows.chapters.length ||
    rows.chapters.some((chapter) => !uniqueChapterIds.has(chapter.id))
  ) {
    return "課綱章節與目前資料不一致";
  }
  if (
    uniqueLessonIds.size !== rows.lessons.length ||
    rows.lessons.some((lesson) => !uniqueLessonIds.has(lesson.id))
  ) {
    return "課綱課堂與目前資料不一致";
  }
  return null;
}

export async function reorderCourseOutline(
  input: CourseOutlineInput,
  actor: { type: "user" | "agent"; id: string },
): Promise<CourseOutlineResult> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${chapters} where ${chapters.courseId} = ${input.courseId} and ${chapters.deletedAt} is null for update`);
    await tx.execute(sql`select id from ${lessons} where ${lessons.courseId} = ${input.courseId} and ${lessons.deletedAt} is null for update`);

    const [chapterRows, lessonRows] = await Promise.all([
      tx
        .select({ id: chapters.id, sortOrder: chapters.sortOrder, updatedAt: chapters.updatedAt })
        .from(chapters)
        .where(and(eq(chapters.courseId, input.courseId), isNull(chapters.deletedAt))),
      tx
        .select({ id: lessons.id, chapterId: lessons.chapterId, sortOrder: lessons.sortOrder, updatedAt: lessons.updatedAt })
        .from(lessons)
        .where(and(eq(lessons.courseId, input.courseId), isNull(lessons.deletedAt))),
    ]);
    const rows = { chapters: chapterRows, lessons: lessonRows };
    if (computeCourseOutlineRevision(rows) !== input.expectedRevision) {
      return { success: false, status: "conflict", error: "課綱已在其他頁面更新，請重新載入" } as const;
    }
    const invalidReason = validateCompleteOutline(input, rows);
    if (invalidReason) {
      return { success: false, status: "invalid", error: invalidReason } as const;
    }

    const now = new Date();
    for (const [chapterIndex, chapter] of input.chapters.entries()) {
      await tx
        .update(chapters)
        .set({ sortOrder: chapterIndex, updatedAt: now })
        .where(and(eq(chapters.id, chapter.id), eq(chapters.courseId, input.courseId)));
      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        await tx
          .update(lessons)
          .set({ chapterId: chapter.id, sortOrder: lessonIndex, updatedAt: now })
          .where(and(eq(lessons.id, lesson.id), eq(lessons.courseId, input.courseId)));
      }
    }

    const nextRows: OutlineRows = {
      chapters: input.chapters.map((chapter, sortOrder) => ({ id: chapter.id, sortOrder, updatedAt: now })),
      lessons: input.chapters.flatMap((chapter) =>
        chapter.lessons.map((lesson, sortOrder) => ({
          id: lesson.id,
          chapterId: chapter.id,
          sortOrder,
          updatedAt: now,
        })),
      ),
    };
    return { success: true, status: "saved", revision: computeCourseOutlineRevision(nextRows) } as const;
  });

  if (result.success) {
    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: "reorder",
      entityType: "course",
      entityId: input.courseId,
      metadata: {
        chapterIds: input.chapters.map((chapter) => chapter.id),
        lessonCount: input.chapters.reduce((count, chapter) => count + chapter.lessons.length, 0),
      },
    });
  }
  return result;
}
