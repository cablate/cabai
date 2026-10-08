import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getEntitledPlanIds } from "@/lib/access";
import { checkCourseAccess } from "@/lib/course-access";
import { db } from "@/lib/db";
import { chapters, courses, lessons, planCourses } from "@/lib/db/schema";
import {
  archiveCourseStatus,
  restoreChapter,
  restoreCourse,
  restoreLesson,
  unarchiveCourseStatus,
} from "@/lib/services/course-service";

export async function listAgentChapters(courseId: string) {
  const rows = await db.select().from(chapters)
    .where(eq(chapters.courseId, courseId)).orderBy(asc(chapters.sortOrder));
  return rows.filter((chapter) => !chapter.deletedAt);
}

export async function listAgentLessons(courseId: string) {
  const rows = await db.select().from(lessons)
    .where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.sortOrder));
  return rows.filter((lesson) => !lesson.deletedAt);
}

export async function getAgentCourseDetail(courseId: string) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
  });
  if (!course) return null;

  const [courseChapters, courseLessons] = await Promise.all([
    db.select().from(chapters)
      .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder)),
    db.select().from(lessons)
      .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.sortOrder)),
  ]);
  return {
    ...course,
    chapters: courseChapters.map((chapter) => ({
      ...chapter,
      lessons: courseLessons.filter((lesson) => lesson.chapterId === chapter.id),
    })),
    stats: {
      totalChapters: courseChapters.length,
      totalLessons: courseLessons.length,
      publishedLessons: courseLessons.filter((lesson) => lesson.status === "published").length,
    },
  };
}

export async function listAgentCourses() {
  return db.select().from(courses)
    .where(isNull(courses.deletedAt)).orderBy(desc(courses.createdAt));
}

async function getUserTokenCourseIds(userId: string) {
  const entitledPlanIds = await getEntitledPlanIds(userId);
  if (entitledPlanIds.size === 0) return [];
  const linked = await db.select({ courseId: planCourses.courseId }).from(planCourses)
    .where(and(inArray(planCourses.planId, [...entitledPlanIds]), isNull(planCourses.removedAt)));
  return [...new Set(linked.map((link) => link.courseId))];
}

export async function listUserTokenCourses(userId: string) {
  const ids = await getUserTokenCourseIds(userId);
  if (ids.length === 0) return [];
  return db.select().from(courses)
    .where(and(inArray(courses.id, ids), eq(courses.status, "published"), isNull(courses.deletedAt)))
    .orderBy(desc(courses.createdAt));
}

export type UserCourseSummary = {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  updatedAt: Date;
};

function toUserCourseSummary(course: UserCourseSummary): UserCourseSummary {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    image: course.image,
    updatedAt: course.updatedAt,
  };
}

export async function listUserTokenCourseSummaries(userId: string): Promise<UserCourseSummary[]> {
  const ids = await getUserTokenCourseIds(userId);
  if (ids.length === 0) return [];

  const rows = await db.select({
    id: courses.id,
    title: courses.title,
    description: courses.description,
    image: courses.image,
    updatedAt: courses.updatedAt,
  }).from(courses)
    .where(and(
      inArray(courses.id, ids),
      eq(courses.status, "published"),
      isNull(courses.deletedAt),
    ))
    .orderBy(desc(courses.createdAt));

  return rows.map(toUserCourseSummary);
}

export type CourseContentResult =
  | { kind: "course-not-found" }
  | { kind: "forbidden" }
  | { kind: "lesson-not-found" }
  | { kind: "ok"; data: Record<string, unknown> };

export async function getUserCourseContent(
  userId: string,
  courseId: string,
  lessonId: string | null,
): Promise<CourseContentResult> {
  const course = await db.query.courses.findFirst({
    where: and(
      eq(courses.id, courseId),
      eq(courses.status, "published"),
      isNull(courses.deletedAt),
    ),
  });
  if (!course || course.status !== "published") return { kind: "course-not-found" };
  const access = await checkCourseAccess(courseId, userId);
  if (!access.hasAccess) return { kind: "forbidden" };

  if (lessonId) {
    const lesson = await db.query.lessons.findFirst({
      where: and(
        eq(lessons.id, lessonId),
        eq(lessons.courseId, courseId),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
      ),
    });
    if (!lesson || lesson.status !== "published") return { kind: "lesson-not-found" };
    const chapter = await db.query.chapters.findFirst({
      where: and(eq(chapters.id, lesson.chapterId), eq(chapters.courseId, courseId), isNull(chapters.deletedAt)),
    });
    return { kind: "ok", data: {
      course: { id: course.id, title: course.title },
      chapter: chapter ? { id: chapter.id, title: chapter.title } : null,
      lesson: {
        id: lesson.id, title: lesson.title, type: lesson.type, content: lesson.content,
        resources: lesson.resourcesJson, duration: lesson.duration, sortOrder: lesson.sortOrder,
      },
    } };
  }

  const [courseChapters, courseLessons] = await Promise.all([
    db.select().from(chapters).where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt))).orderBy(asc(chapters.sortOrder)),
    db.select().from(lessons).where(and(
      eq(lessons.courseId, courseId),
      eq(lessons.status, "published"),
      isNull(lessons.deletedAt),
    )).orderBy(asc(lessons.sortOrder)),
  ]);
  const publishedLessons = courseLessons.filter((lesson) => lesson.status === "published");
  return { kind: "ok", data: {
    course: { id: course.id, title: course.title, description: course.description, status: course.status, updatedAt: course.updatedAt },
    purchase: { orderId: access.planId, purchasedAt: null, entitlement: "full_access" },
    content: {
      format: "markdown", language: "zh-TW",
      chapters: courseChapters.map((chapter) => ({
        id: chapter.id, title: chapter.title, sortOrder: chapter.sortOrder,
        lessons: publishedLessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => ({
          id: lesson.id, title: lesson.title, type: lesson.type, duration: lesson.duration, sortOrder: lesson.sortOrder,
        })),
      })),
      supplementary: { resources: [], extractedSkills: [] },
    },
  } };
}

export async function archiveAgentCourse(courseId: string, agentId: string) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
  });
  if (!course) return "not-found" as const;
  if (course.status === "archived") return "already-archived" as const;
  await archiveCourseStatus(courseId, { type: "agent", id: agentId });
  return "archived" as const;
}

export async function unarchiveAgentCourse(courseId: string, actor: { id: string; name: string }) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
  });
  if (!course) return "not-found" as const;
  if (course.status !== "archived") return "not-archived" as const;
  await unarchiveCourseStatus(courseId, {
    type: "agent",
    id: actor.id,
    name: actor.name,
  });
  return "draft" as const;
}

export async function restoreAgentCourse(courseId: string, agentId: string) {
  const row = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), isNotNull(courses.deletedAt)) });
  if (!row) return false;
  await restoreCourse(courseId, { type: "agent", id: agentId });
  return true;
}

export async function restoreAgentChapter(chapterId: string, agentId: string) {
  const row = await db.query.chapters.findFirst({ where: and(eq(chapters.id, chapterId), isNotNull(chapters.deletedAt)) });
  if (!row) return false;
  await restoreChapter(chapterId, { type: "agent", id: agentId });
  return true;
}

export async function restoreAgentLesson(lessonId: string, agentId: string) {
  const row = await db.query.lessons.findFirst({ where: and(eq(lessons.id, lessonId), isNotNull(lessons.deletedAt)) });
  if (!row) return false;
  await restoreLesson(lessonId, { type: "agent", id: agentId });
  return true;
}
