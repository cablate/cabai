import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, lessons, userProgress } from "@/lib/db/schema";
import { resolveCourseLearningState, type CourseLearningState } from "@/lib/learning-progress";

export interface CourseLearningSummary extends CourseLearningState {
  courseId: string;
  resumeHref: string;
  resumeLessonTitle: string | null;
}

export async function getCourseLearningSummaries(
  courseIds: string[],
  userId: string,
): Promise<Map<string, CourseLearningSummary>> {
  const uniqueCourseIds = [...new Set(courseIds)].filter(Boolean);
  if (uniqueCourseIds.length === 0) return new Map();

  const [chapterRows, lessonRows] = await Promise.all([
    db.select({ id: chapters.id, courseId: chapters.courseId, sortOrder: chapters.sortOrder })
      .from(chapters)
      .where(and(inArray(chapters.courseId, uniqueCourseIds), isNull(chapters.deletedAt))),
    db.select({ id: lessons.id, title: lessons.title, courseId: lessons.courseId, chapterId: lessons.chapterId, sortOrder: lessons.sortOrder })
      .from(lessons)
      .where(and(inArray(lessons.courseId, uniqueCourseIds), eq(lessons.status, "published"), isNull(lessons.deletedAt))),
  ]);
  const lessonIds = lessonRows.map((lesson) => lesson.id);
  const progressRows = lessonIds.length > 0
    ? await db.select({
        lessonId: userProgress.lessonId,
        completed: userProgress.completed,
        progress: userProgress.progress,
        lastAccessedAt: userProgress.lastAccessedAt,
      }).from(userProgress).where(and(eq(userProgress.userId, userId), inArray(userProgress.lessonId, lessonIds)))
    : [];
  const chapterSort = new Map(chapterRows.map((chapter) => [chapter.id, chapter.sortOrder]));
  const result = new Map<string, CourseLearningSummary>();

  for (const courseId of uniqueCourseIds) {
    const courseLessons = lessonRows.filter((lesson) => lesson.courseId === courseId);
    const courseLessonIds = new Set(courseLessons.map((lesson) => lesson.id));
    const state = resolveCourseLearningState(
      courseLessons.map((lesson) => ({
        id: lesson.id,
        chapterSortOrder: chapterSort.get(lesson.chapterId) ?? 0,
        lessonSortOrder: lesson.sortOrder,
      })),
      progressRows.filter((row) => courseLessonIds.has(row.lessonId)),
    );
    result.set(courseId, {
      courseId,
      ...state,
      resumeLessonTitle: courseLessons.find((lesson) => lesson.id === state.resumeLessonId)?.title ?? null,
      resumeHref: state.resumeLessonId
        ? `/courses/${courseId}/lessons/${state.resumeLessonId}`
        : `/courses/${courseId}`,
    });
  }
  return result;
}
