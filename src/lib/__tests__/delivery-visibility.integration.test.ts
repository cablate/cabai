import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { courses, lessons, userProgress } from "@/lib/db/schema";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import {
  cleanTestData, createTestChapter, createTestCourse, createTestLesson,
  createTestPlan, createTestUser, linkCourseToPlan,
} from "@/test/helpers";

beforeEach(cleanTestData);
afterAll(cleanTestData);

describe("delivery overview publication boundary", () => {
  it("hides unpublished course metadata and lesson/completion counts while retaining admin authoring", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan();
    const published = await createTestCourse({ status: "published" });
    const draft = await createTestCourse({ title: "Secret draft", status: "draft" });
    const archived = await createTestCourse({ status: "archived" });
    const deleted = await createTestCourse({ status: "published" });
    await db.update(courses).set({ deletedAt: new Date() }).where(eq(courses.id, deleted.id));
    for (const course of [published, draft, archived, deleted]) await linkCourseToPlan(course.id, plan.id);
    const chapter = await createTestChapter(published.id);
    const visibleLesson = await createTestLesson(published.id, chapter.id, { status: "published" });
    const draftLesson = await createTestLesson(published.id, chapter.id, { status: "draft" });
    const deletedLesson = await createTestLesson(published.id, chapter.id, { status: "published" });
    await db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, deletedLesson.id));
    for (const lesson of [visibleLesson, draftLesson, deletedLesson]) {
      await db.insert(userProgress).values({ userId: user.id, lessonId: lesson.id, completed: true });
    }

    const anonymous = await getDeliveryOverviewForPlan(plan.id);
    expect(anonymous.courses.map((course) => course.id)).toEqual([published.id]);
    expect(anonymous.lessonCount).toBe(1);
    expect(anonymous.completedLessonCount).toBe(0);
    const member = await getDeliveryOverviewForPlan(plan.id, user.id);
    expect(member.courseCount).toBe(1);
    expect(member.lessonCount).toBe(1);
    expect(member.completedLessonCount).toBe(1);
    expect(JSON.stringify(member)).not.toContain("Secret draft");

    const admin = await getDeliveryOverviewForPlan(plan.id, user.id, { includeUnpublished: true });
    expect(admin.courses.map((course) => course.id).sort()).toEqual([published.id, draft.id, archived.id].sort());
    expect(admin.lessonCount).toBe(2);
    expect(admin.completedLessonCount).toBe(2);
  });
});
