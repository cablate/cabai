import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, courses, lessons } from "@/lib/db/schema";
import {
  createTestChapter,
  createTestCourse,
  createTestLesson,
  createTestPlan,
  cleanTestData,
  linkCourseToPlan,
} from "@/test/helpers";
import {
  getPublishedCourseSyllabusForPlan,
  getPublishedCourseStatsForPlan,
  getPublishedPreviewContext,
} from "@/lib/queries/course-catalog";

describe("course catalog query owners", () => {
  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it("returns only the active published syllabus with stable outline data", async () => {
    const plan = await createTestPlan({ name: "Published syllabus plan" });
    const course = await createTestCourse({
      title: "Published course",
      status: "published",
    });
    await linkCourseToPlan(course.id, plan.id);

    const chapterTwo = await createTestChapter(course.id, {
      title: "第二章",
      sortOrder: 2,
    });
    const chapterOne = await createTestChapter(course.id, {
      title: "第一章",
      sortOrder: 1,
    });
    await db
      .update(chapters)
      .set({ defaultExpanded: true })
      .where(eq(chapters.id, chapterOne.id));

    const publishedPreview = await createTestLesson(course.id, chapterOne.id, {
      title: "公開試看",
      status: "published",
      isPreview: true,
    });
    const publishedLesson = await createTestLesson(course.id, chapterTwo.id, {
      title: "公開課堂",
      status: "published",
    });
    await createTestLesson(course.id, chapterOne.id, {
      title: "草稿課堂",
      status: "draft",
    });
    const deletedLesson = await createTestLesson(course.id, chapterTwo.id, {
      title: "刪除課堂",
      status: "published",
    });

    await db
      .update(lessons)
      .set({ sortOrder: 3, duration: 180 })
      .where(eq(lessons.id, publishedPreview.id));
    await db
      .update(lessons)
      .set({ sortOrder: 1, duration: 600 })
      .where(eq(lessons.id, publishedLesson.id));
    await db
      .update(lessons)
      .set({ deletedAt: new Date(), sortOrder: 0 })
      .where(eq(lessons.id, deletedLesson.id));

    const syllabus = await getPublishedCourseSyllabusForPlan(plan.id);

    expect(syllabus).toEqual({
      courseId: course.id,
      courseTitle: "Published course",
      chapters: [
        {
          id: chapterOne.id,
          title: "第一章",
          defaultExpanded: true,
          lessons: [
            {
              id: publishedPreview.id,
              title: "公開試看",
              type: "video",
              duration: 180,
              isPreview: true,
            },
          ],
        },
        {
          id: chapterTwo.id,
          title: "第二章",
          defaultExpanded: false,
          lessons: [
            {
              id: publishedLesson.id,
              title: "公開課堂",
              type: "video",
              duration: 600,
              isPreview: false,
            },
          ],
        },
      ],
      totalLessons: 2,
      totalDurationSeconds: 780,
      previewCount: 1,
    });
    await expect(getPublishedCourseStatsForPlan(plan.id)).resolves.toEqual({
      courseId: course.id,
      chapterCount: 2,
      lessonCount: 2,
      totalDurationSeconds: 780,
      previewCount: 1,
    });
  });

  it("does not expose removed mappings, draft courses, or deleted courses", async () => {
    const removedPlan = await createTestPlan({ name: "Removed mapping plan" });
    const removedCourse = await createTestCourse({ status: "published" });
    await linkCourseToPlan(removedCourse.id, removedPlan.id, {
      removedAt: new Date(),
    });

    const draftPlan = await createTestPlan({ name: "Draft course plan" });
    const draftCourse = await createTestCourse({ status: "draft" });
    await linkCourseToPlan(draftCourse.id, draftPlan.id);

    const deletedPlan = await createTestPlan({ name: "Deleted course plan" });
    const deletedCourse = await createTestCourse({ status: "published" });
    await db
      .update(courses)
      .set({ deletedAt: new Date() })
      .where(eq(courses.id, deletedCourse.id));
    await linkCourseToPlan(deletedCourse.id, deletedPlan.id);

    await expect(
      getPublishedCourseSyllabusForPlan(removedPlan.id),
    ).resolves.toBeNull();
    await expect(
      getPublishedCourseSyllabusForPlan(draftPlan.id),
    ).resolves.toBeNull();
    await expect(
      getPublishedCourseSyllabusForPlan(deletedPlan.id),
    ).resolves.toBeNull();
  });

  it("returns only a published preview and its published navigation context", async () => {
    const plan = await createTestPlan({
      name: "Preview plan",
      amount: 1234,
      billingPeriod: "one-time",
    });
    const course = await createTestCourse({
      title: "Preview course",
      status: "published",
    });
    await linkCourseToPlan(course.id, plan.id);

    const firstChapter = await createTestChapter(course.id, {
      title: "第一章",
      sortOrder: 1,
    });
    const secondChapter = await createTestChapter(course.id, {
      title: "第二章",
      sortOrder: 2,
    });

    const previewLesson = await createTestLesson(course.id, firstChapter.id, {
      title: "可試看課堂",
      status: "published",
      isPreview: true,
      type: "text",
      content: "# Preview",
    });
    const regularLesson = await createTestLesson(course.id, secondChapter.id, {
      title: "需購買課堂",
      status: "published",
      isPreview: false,
    });
    const draftPreview = await createTestLesson(course.id, firstChapter.id, {
      title: "草稿試看",
      status: "draft",
      isPreview: true,
    });
    const deletedPreview = await createTestLesson(course.id, secondChapter.id, {
      title: "刪除試看",
      status: "published",
      isPreview: true,
    });

    await db
      .update(lessons)
      .set({
        sortOrder: 1,
        resourcesJson: [
          {
            id: "resource-1",
            type: "link",
            title: "課程連結",
            url: "https://example.com/resource",
            sortOrder: 0,
          },
        ],
      })
      .where(eq(lessons.id, previewLesson.id));
    await db
      .update(lessons)
      .set({ sortOrder: 2 })
      .where(eq(lessons.id, regularLesson.id));
    await db
      .update(lessons)
      .set({ sortOrder: 0 })
      .where(eq(lessons.id, draftPreview.id));
    await db
      .update(lessons)
      .set({ deletedAt: new Date(), sortOrder: 0 })
      .where(eq(lessons.id, deletedPreview.id));

    const context = await getPublishedPreviewContext(
      course.id,
      previewLesson.id,
    );

    expect(context).not.toBeNull();
    expect(context?.lesson).toMatchObject({
      id: previewLesson.id,
      title: "可試看課堂",
      type: "text",
      content: "# Preview",
      sortOrder: 1,
      chapterId: firstChapter.id,
      resources: [
        {
          id: "resource-1",
          type: "link",
          title: "課程連結",
          url: "https://example.com/resource",
          sortOrder: 0,
        },
      ],
    });
    expect(context?.course).toEqual({ id: course.id, title: "Preview course" });
    expect(context?.plan).toMatchObject({
      id: plan.id,
      name: "Preview plan",
      amount: 1234,
      billingPeriod: "one-time",
    });
    expect(context?.outline).toEqual([
      {
        chapter: {
          id: firstChapter.id,
          title: "第一章",
          sortOrder: 1,
        },
        lessons: [
          {
            id: previewLesson.id,
            title: "可試看課堂",
            isPreview: true,
            sortOrder: 1,
          },
        ],
      },
      {
        chapter: {
          id: secondChapter.id,
          title: "第二章",
          sortOrder: 2,
        },
        lessons: [
          {
            id: regularLesson.id,
            title: "需購買課堂",
            isPreview: false,
            sortOrder: 2,
          },
        ],
      },
    ]);
    expect(context?.flatPreviews).toEqual([
      {
        id: previewLesson.id,
        title: "可試看課堂",
        chapterSortOrder: 1,
        sortOrder: 1,
      },
    ]);

    await expect(
      getPublishedPreviewContext(course.id, regularLesson.id),
    ).resolves.toBeNull();
    await expect(
      getPublishedPreviewContext(course.id, draftPreview.id),
    ).resolves.toBeNull();
    await expect(
      getPublishedPreviewContext(course.id, deletedPreview.id),
    ).resolves.toBeNull();
  });
});
