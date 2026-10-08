import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, lessons, userProgress } from "@/lib/db/schema";
import {
  resolveCourseLearningState,
  type CourseLearningState,
  type LessonProgressInput,
} from "@/lib/learning-progress";

/**
 * The progress state for one lesson in a learner's published course view.
 *
 * A snapshot is emitted for every eligible lesson, even when the learner has
 * no `user_progress` row yet.  This keeps the page consumer's existing
 * `progressMap.get(lessonId)` behaviour while making the query owner output
 * explicit and serialisable.
 */
export interface LearnerLessonProgressSnapshot {
  completed: boolean;
  progress: number;
  lastAccessedAt: Date | null;
}

export interface LearnerCourseNextLesson {
  id: string;
  title: string;
  chapterId: string;
  duration: number | null;
}

/**
 * Typed, read-only learner progress view shared by dashboard and course pages.
 *
 * The caller supplies an already authorised user and course set.  This owner
 * deliberately does not perform entitlement checks, Portaly fallback/self-
 * heal, writes, or revalidation; those boundaries remain with the caller.
 */
export interface LearnerCourseProgress extends CourseLearningState {
  courseId: string;
  totalLessonCount: number;
  resumeLessonTitle: string | null;
  resumeHref: string;
  nextLesson: LearnerCourseNextLesson | null;
  lessonProgress: Record<string, LearnerLessonProgressSnapshot>;
}

type EligibleLessonRow = {
  id: string;
  title: string;
  courseId: string;
  chapterId: string;
  chapterSortOrder: number;
  sortOrder: number;
  duration: number | null;
};

/**
 * Return published learner progress for the supplied course IDs.
 *
 * Only non-deleted chapters and published/non-deleted lessons participate in
 * the state.  Progress rows are constrained to those lesson IDs, so stale
 * rows for drafts/deleted content cannot affect completion or resume order.
 */
export async function getLearnerCourseProgress(
  courseIds: string[],
  userId: string,
): Promise<Map<string, LearnerCourseProgress>> {
  const uniqueCourseIds = [...new Set(courseIds)].filter(Boolean);
  if (uniqueCourseIds.length === 0) return new Map();

  const lessonRows = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      courseId: lessons.courseId,
      chapterId: lessons.chapterId,
      chapterSortOrder: chapters.sortOrder,
      sortOrder: lessons.sortOrder,
      duration: lessons.duration,
    })
    .from(lessons)
    .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
    .where(
      and(
        inArray(lessons.courseId, uniqueCourseIds),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
        isNull(chapters.deletedAt),
      ),
    );

  const lessonIds = lessonRows.map((lesson) => lesson.id);
  const progressRows: LessonProgressInput[] = lessonIds.length > 0
    ? await db
        .select({
          lessonId: userProgress.lessonId,
          completed: userProgress.completed,
          progress: userProgress.progress,
          lastAccessedAt: userProgress.lastAccessedAt,
        })
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, userId),
            inArray(userProgress.lessonId, lessonIds),
          ),
        )
    : [];

  const lessonsByCourse = new Map<string, EligibleLessonRow[]>();
  for (const lesson of lessonRows) {
    const courseLessons = lessonsByCourse.get(lesson.courseId) ?? [];
    courseLessons.push(lesson);
    lessonsByCourse.set(lesson.courseId, courseLessons);
  }

  const progressByLesson = new Map(
    progressRows.map((row) => [row.lessonId, row] as const),
  );
  const result = new Map<string, LearnerCourseProgress>();

  for (const courseId of uniqueCourseIds) {
    const courseLessons = lessonsByCourse.get(courseId) ?? [];
    const courseLessonIds = new Set(courseLessons.map((lesson) => lesson.id));
    const courseProgressRows = progressRows.filter((row) =>
      courseLessonIds.has(row.lessonId),
    );
    const state = resolveCourseLearningState(
      courseLessons.map((lesson) => ({
        id: lesson.id,
        chapterSortOrder: lesson.chapterSortOrder,
        lessonSortOrder: lesson.sortOrder,
      })),
      courseProgressRows,
    );
    const resumeLesson = courseLessons.find(
      (lesson) => lesson.id === state.resumeLessonId,
    );
    const lessonProgress: Record<string, LearnerLessonProgressSnapshot> = {};
    for (const lesson of courseLessons) {
      const progress = progressByLesson.get(lesson.id);
      lessonProgress[lesson.id] = {
        completed: progress?.completed ?? false,
        progress: progress?.progress ?? 0,
        lastAccessedAt: progress?.lastAccessedAt ?? null,
      };
    }

    result.set(courseId, {
      courseId,
      totalLessonCount: courseLessons.length,
      ...state,
      resumeLessonTitle: resumeLesson?.title ?? null,
      resumeHref: state.resumeLessonId
        ? `/courses/${courseId}/lessons/${state.resumeLessonId}`
        : `/courses/${courseId}`,
      nextLesson: resumeLesson
        ? {
            id: resumeLesson.id,
            title: resumeLesson.title,
            chapterId: resumeLesson.chapterId,
            duration: resumeLesson.duration,
          }
        : null,
      lessonProgress,
    });
  }

  return result;
}
