import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chapters,
  courses,
  lessons,
  planCourses,
  plans,
} from "@/lib/db/schema";
import {
  parseLessonResources,
  type LessonContentType,
  type LessonResource,
} from "@/lib/lesson-content";

/**
 * The public, published course view used by product detail pages.
 *
 * These are deliberately plain values rather than Drizzle rows.  The query
 * owner is responsible for the publication and soft-delete predicates, while
 * callers remain responsible for presentation visibility and entitlement.
 */
export interface PublishedCourseSyllabusLesson {
  id: string;
  title: string;
  type: LessonContentType;
  duration: number | null;
  isPreview: boolean;
}

export interface PublishedCourseSyllabusChapter {
  id: string;
  title: string;
  defaultExpanded: boolean;
  lessons: PublishedCourseSyllabusLesson[];
}

export interface PublishedCourseSyllabus {
  courseId: string;
  courseTitle: string;
  chapters: PublishedCourseSyllabusChapter[];
  totalLessons: number;
  totalDurationSeconds: number;
  previewCount: number;
}

export interface PublishedCourseStats {
  courseId: string;
  chapterCount: number;
  lessonCount: number;
  totalDurationSeconds: number;
  previewCount: number;
}

export interface PublishedPreviewContext {
  lesson: {
    id: string;
    title: string;
    type: LessonContentType;
    content: string;
    resources: LessonResource[];
    sortOrder: number;
    chapterId: string;
  };
  course: {
    id: string;
    title: string;
  };
  plan: {
    id: string;
    name: string;
    amount: number;
    billingPeriod: string;
    purchaseButtonMode: string;
  } | null;
  outline: Array<{
    chapter: { id: string; title: string; sortOrder: number };
    lessons: Array<{
      id: string;
      title: string;
      isPreview: boolean;
      sortOrder: number;
    }>;
  }>;
  flatPreviews: Array<{
    id: string;
    title: string;
    chapterSortOrder: number;
    sortOrder: number;
  }>;
}

/**
 * Read the first active published course attached to a plan.
 *
 * The product page still owns the plan presentation visibility gate.  This
 * method only owns the public course/outline publication predicates and is
 * intentionally read-only.
 */
export async function getPublishedCourseSyllabusForPlan(
  planId: string,
): Promise<PublishedCourseSyllabus | null> {
  const courseRows = await db
    .select({ id: courses.id, title: courses.title })
    .from(planCourses)
    .innerJoin(courses, eq(planCourses.courseId, courses.id))
    .where(
      and(
        eq(planCourses.planId, planId),
        isNull(planCourses.removedAt),
        isNull(courses.deletedAt),
        eq(courses.status, "published"),
      ),
    )
    .limit(1);

  if (courseRows.length === 0) return null;

  const course = courseRows[0]!;

  const [allChapters, allLessons] = await Promise.all([
    db
      .select({
        id: chapters.id,
        title: chapters.title,
        sortOrder: chapters.sortOrder,
        defaultExpanded: chapters.defaultExpanded,
      })
      .from(chapters)
      .where(and(eq(chapters.courseId, course.id), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder), asc(chapters.id)),
    db
      .select({
        id: lessons.id,
        title: lessons.title,
        type: lessons.type,
        duration: lessons.duration,
        isPreview: lessons.isPreview,
        chapterId: lessons.chapterId,
        sortOrder: lessons.sortOrder,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, course.id),
          isNull(lessons.deletedAt),
          eq(lessons.status, "published"),
        ),
      )
      .orderBy(asc(lessons.sortOrder), asc(lessons.id)),
  ]);

  const syllabusChapters: PublishedCourseSyllabusChapter[] = allChapters.map(
    (chapter) => ({
      id: chapter.id,
      title: chapter.title,
      defaultExpanded: chapter.defaultExpanded,
      lessons: allLessons
        .filter((lesson) => lesson.chapterId === chapter.id)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          duration: lesson.duration,
          isPreview: lesson.isPreview,
        })),
    }),
  );

  let totalDuration = 0;
  let previewCount = 0;
  for (const lesson of allLessons) {
    if (lesson.duration) totalDuration += lesson.duration;
    if (lesson.isPreview) previewCount++;
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    chapters: syllabusChapters,
    totalLessons: allLessons.length,
    totalDurationSeconds: totalDuration,
    previewCount,
  };
}

export async function getPublishedCourseStatsForPlan(
  planId: string,
): Promise<PublishedCourseStats | null> {
  const syllabus = await getPublishedCourseSyllabusForPlan(planId);
  if (!syllabus) return null;

  return {
    courseId: syllabus.courseId,
    chapterCount: syllabus.chapters.length,
    lessonCount: syllabus.totalLessons,
    totalDurationSeconds: syllabus.totalDurationSeconds,
    previewCount: syllabus.previewCount,
  };
}

/**
 * Read one anonymous published preview and its published navigation context.
 *
 * A lesson is eligible only when it belongs to the requested published course,
 * is itself published/non-deleted, and is explicitly marked as a preview.  A
 * missing or ineligible lesson returns null so the page can preserve its 404.
 */
export async function getPublishedPreviewContext(
  courseId: string,
  lessonId: string,
): Promise<PublishedPreviewContext | null> {
  const lesson = await db.query.lessons.findFirst({
    columns: {
      id: true,
      title: true,
      type: true,
      content: true,
      resourcesJson: true,
      sortOrder: true,
      chapterId: true,
    },
    where: and(
      eq(lessons.id, lessonId),
      eq(lessons.courseId, courseId),
      eq(lessons.isPreview, true),
      eq(lessons.status, "published"),
      isNull(lessons.deletedAt),
    ),
  });
  if (!lesson) return null;

  const course = await db.query.courses.findFirst({
    columns: { id: true, title: true },
    where: and(
      eq(courses.id, courseId),
      eq(courses.status, "published"),
      isNull(courses.deletedAt),
    ),
  });
  if (!course) return null;

  const planRow = await db
    .select({
      id: plans.id,
      name: plans.name,
      amount: plans.amount,
      billingPeriod: plans.billingPeriod,
      purchaseButtonMode: plans.purchaseButtonMode,
    })
    .from(planCourses)
    .innerJoin(plans, eq(planCourses.planId, plans.id))
    .where(
      and(eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)),
    )
    .limit(1);

  const [allChapters, allLessons] = await Promise.all([
    db
      .select({
        id: chapters.id,
        title: chapters.title,
        sortOrder: chapters.sortOrder,
      })
      .from(chapters)
      .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder), asc(chapters.id)),
    db
      .select({
        id: lessons.id,
        title: lessons.title,
        chapterId: lessons.chapterId,
        sortOrder: lessons.sortOrder,
        isPreview: lessons.isPreview,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessons.status, "published"),
          isNull(lessons.deletedAt),
        ),
      )
      .orderBy(asc(lessons.sortOrder), asc(lessons.id)),
  ]);

  const outline = allChapters.map((chapter) => ({
    chapter,
    lessons: allLessons
      .filter((lesson) => lesson.chapterId === chapter.id)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        isPreview: lesson.isPreview,
        sortOrder: lesson.sortOrder,
      })),
  }));

  const chapterSortMap = new Map(
    allChapters.map((chapter) => [chapter.id, chapter.sortOrder] as const),
  );
  const flatPreviews = allLessons
    .filter((lesson) => lesson.isPreview)
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      chapterSortOrder: chapterSortMap.get(lesson.chapterId) ?? 0,
      sortOrder: lesson.sortOrder,
    }))
    .sort((a, b) => {
      if (a.chapterSortOrder !== b.chapterSortOrder) {
        return a.chapterSortOrder - b.chapterSortOrder;
      }
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    });

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      content: lesson.content,
      resources: parseLessonResources(lesson.resourcesJson),
      sortOrder: lesson.sortOrder,
      chapterId: lesson.chapterId,
    },
    course,
    plan: planRow[0] ?? null,
    outline,
    flatPreviews,
  };
}
