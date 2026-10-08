import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, lessons, userProgress } from "@/lib/db/schema";
import {
  cleanTestData,
  createTestChapter,
  createTestCourse,
  createTestLesson,
  createTestUser,
} from "@/test/helpers";
import { getLearnerCourseProgress } from "@/lib/queries/learner-course-progress";

describe("learner course progress query owner", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("filters to published content and resolves recent incomplete continuation", async () => {
    const user = await createTestUser({ email: "test-learner-progress@example.com" });
    const course = await createTestCourse({
      title: "Progress course",
      status: "published",
    });
    const firstChapter = await createTestChapter(course.id, {
      title: "第一章",
      sortOrder: 1,
    });
    const secondChapter = await createTestChapter(course.id, {
      title: "第二章",
      sortOrder: 2,
    });
    const deletedChapter = await createTestChapter(course.id, {
      title: "已刪除章節",
      sortOrder: 0,
    });

    const completedLesson = await createTestLesson(course.id, firstChapter.id, {
      title: "已完成",
      status: "published",
    });
    const recentIncompleteLesson = await createTestLesson(
      course.id,
      firstChapter.id,
      { title: "最近學習", status: "published" },
    );
    const fallbackLesson = await createTestLesson(course.id, secondChapter.id, {
      title: "尚未開始",
      status: "published",
    });
    const draftLesson = await createTestLesson(course.id, firstChapter.id, {
      title: "草稿不計入",
      status: "draft",
    });
    const deletedLesson = await createTestLesson(course.id, secondChapter.id, {
      title: "刪除不計入",
      status: "published",
    });
    const deletedChapterLesson = await createTestLesson(
      course.id,
      deletedChapter.id,
      { title: "刪除章節內不計入", status: "published" },
    );

    await db
      .update(lessons)
      .set({ sortOrder: 1 })
      .where(eq(lessons.id, completedLesson.id));
    await db
      .update(lessons)
      .set({ sortOrder: 2 })
      .where(eq(lessons.id, recentIncompleteLesson.id));
    await db
      .update(lessons)
      .set({ sortOrder: 1 })
      .where(eq(lessons.id, fallbackLesson.id));
    await db
      .update(lessons)
      .set({ deletedAt: new Date() })
      .where(eq(lessons.id, deletedLesson.id));
    await db
      .update(chapters)
      .set({ deletedAt: new Date() })
      .where(eq(chapters.id, deletedChapter.id));

    const recentAccess = new Date("2026-07-12T10:00:00.000Z");
    await db.insert(userProgress).values([
      {
        userId: user.id,
        lessonId: completedLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: new Date("2026-07-10T10:00:00.000Z"),
      },
      {
        userId: user.id,
        lessonId: recentIncompleteLesson.id,
        completed: false,
        progress: 20,
        lastAccessedAt: recentAccess,
      },
      // These stale rows must not affect the published learner view.
      {
        userId: user.id,
        lessonId: draftLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: recentAccess,
      },
      {
        userId: user.id,
        lessonId: deletedLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: recentAccess,
      },
      {
        userId: user.id,
        lessonId: deletedChapterLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: recentAccess,
      },
    ]);

    const result = await getLearnerCourseProgress(
      [course.id, course.id, ""],
      user.id,
    );
    const progress = result.get(course.id);

    expect(result).toHaveLength(1);
    expect(progress).toMatchObject({
      courseId: course.id,
      totalLessonCount: 3,
      orderedLessonIds: [
        completedLesson.id,
        recentIncompleteLesson.id,
        fallbackLesson.id,
      ],
      completedLessonCount: 1,
      progressPercent: 33,
      resumeLessonId: recentIncompleteLesson.id,
      resumeLessonTitle: "最近學習",
      resumeHref: `/courses/${course.id}/lessons/${recentIncompleteLesson.id}`,
      nextLesson: {
        id: recentIncompleteLesson.id,
        title: "最近學習",
        chapterId: firstChapter.id,
        duration: null,
      },
      isCompleted: false,
    });
    expect(progress?.lessonProgress).toEqual({
      [completedLesson.id]: {
        completed: true,
        progress: 100,
        lastAccessedAt: new Date("2026-07-10T10:00:00.000Z"),
      },
      [recentIncompleteLesson.id]: {
        completed: false,
        progress: 20,
        lastAccessedAt: recentAccess,
      },
      [fallbackLesson.id]: {
        completed: false,
        progress: 0,
        lastAccessedAt: null,
      },
    });
    expect(progress?.lessonProgress[draftLesson.id]).toBeUndefined();
    expect(progress?.lessonProgress[deletedLesson.id]).toBeUndefined();
    expect(progress?.lessonProgress[deletedChapterLesson.id]).toBeUndefined();
  });

  it("returns completed and zero-lesson courses with stable empty semantics", async () => {
    const user = await createTestUser({ email: "test-learner-complete@example.com" });
    const completedCourse = await createTestCourse({
      title: "Completed course",
      status: "published",
    });
    const chapter = await createTestChapter(completedCourse.id, {
      sortOrder: 1,
    });
    const firstLesson = await createTestLesson(completedCourse.id, chapter.id, {
      status: "published",
    });
    const secondLesson = await createTestLesson(completedCourse.id, chapter.id, {
      status: "published",
    });
    await db.insert(userProgress).values([
      {
        userId: user.id,
        lessonId: firstLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: new Date("2026-07-01T10:00:00.000Z"),
      },
      {
        userId: user.id,
        lessonId: secondLesson.id,
        completed: true,
        progress: 100,
        lastAccessedAt: new Date("2026-07-02T10:00:00.000Z"),
      },
    ]);

    const emptyCourse = await createTestCourse({
      title: "Empty course",
      status: "published",
    });
    const result = await getLearnerCourseProgress(
      [completedCourse.id, emptyCourse.id],
      user.id,
    );

    expect(result.get(completedCourse.id)).toMatchObject({
      totalLessonCount: 2,
      completedLessonCount: 2,
      progressPercent: 100,
      resumeLessonId: null,
      resumeLessonTitle: null,
      resumeHref: `/courses/${completedCourse.id}`,
      nextLesson: null,
      isCompleted: true,
    });
    expect(result.get(emptyCourse.id)).toMatchObject({
      totalLessonCount: 0,
      orderedLessonIds: [],
      completedLessonCount: 0,
      progressPercent: 0,
      resumeLessonId: null,
      resumeLessonTitle: null,
      resumeHref: `/courses/${emptyCourse.id}`,
      nextLesson: null,
      isCompleted: false,
      lessonProgress: {},
    });
  });
});
