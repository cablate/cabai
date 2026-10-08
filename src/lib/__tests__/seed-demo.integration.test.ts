import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chapters,
  courses,
  lessons,
  planCourses,
  planPresentations,
  plans,
} from "@/lib/db/schema";
import { cleanTestData } from "@/test/helpers";
import { DEMO_IDS, seedDemo } from "../../../scripts/seed-demo";
import { getPublishedCourseSyllabusForPlan } from "@/lib/queries/course-catalog";

async function removeDemoSeed(): Promise<void> {
  await db.delete(lessons).where(eq(lessons.courseId, DEMO_IDS.courseId));
  await db.delete(chapters).where(eq(chapters.courseId, DEMO_IDS.courseId));
  await db.delete(planCourses).where(eq(planCourses.planId, DEMO_IDS.planId));
  await db.delete(planPresentations).where(eq(planPresentations.planId, DEMO_IDS.planId));
  await db.delete(courses).where(eq(courses.id, DEMO_IDS.courseId));
  await db.delete(plans).where(eq(plans.id, DEMO_IDS.planId));
}

describe("neutral demo seed", () => {
  beforeEach(async () => {
    await cleanTestData();
    await removeDemoSeed();
  });

  afterAll(async () => {
    await cleanTestData();
    await removeDemoSeed();
  });

  it("creates the published free-claim graph and is idempotent", async () => {
    const first = await seedDemo();
    const second = await seedDemo();

    expect(first).toEqual({
      planId: DEMO_IDS.planId,
      courseId: DEMO_IDS.courseId,
      chapterCount: 2,
      lessonCount: 3,
      freeClaimEnabled: true,
    });
    expect(second).toEqual(first);

    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, DEMO_IDS.planId));
    const [presentation] = await db
      .select()
      .from(planPresentations)
      .where(eq(planPresentations.planId, DEMO_IDS.planId));
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, DEMO_IDS.courseId));
    const seededChapters = await db
      .select()
      .from(chapters)
      .where(eq(chapters.courseId, DEMO_IDS.courseId));
    const seededLessons = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, DEMO_IDS.courseId));
    const [mapping] = await db
      .select()
      .from(planCourses)
      .where(
        and(
          eq(planCourses.planId, DEMO_IDS.planId),
          eq(planCourses.courseId, DEMO_IDS.courseId),
        ),
      );

    expect(plan).toMatchObject({
      slug: "demo-course",
      status: "active",
      gateway: "manual",
      purchaseButtonMode: "free_claim",
      hasPlatformContent: true,
    });
    expect(presentation).toMatchObject({
      offeringType: "course",
      publishedAt: expect.any(Date),
    });
    expect(course).toMatchObject({
      title: "站台驗收範例課程",
      status: "published",
    });
    expect(seededChapters).toHaveLength(2);
    expect(seededLessons).toHaveLength(3);
    expect(seededLessons.filter((lesson) => lesson.isPreview)).toHaveLength(1);
    expect(seededLessons.every((lesson) => lesson.status === "published")).toBe(true);
    expect(seededLessons.every((lesson) => {
      const content = lesson.content.toLowerCase();
      return !content.includes("cabai") && !content.includes("cablate") && !content.includes("portaly");
    })).toBe(true);
    expect(mapping).toMatchObject({ removedAt: null });

    const syllabus = await getPublishedCourseSyllabusForPlan(DEMO_IDS.planId);
    expect(syllabus).toMatchObject({
      courseId: DEMO_IDS.courseId,
      totalLessons: 3,
      previewCount: 1,
    });

    const planRows = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, DEMO_IDS.planId));
    expect(planRows).toHaveLength(1);
  });
});
