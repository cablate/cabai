/**
 * Tests toggleLessonComplete unmark-prevention logic.
 * Requires a real test DB (DATABASE_URL with _test).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next-auth", () => ({ default: vi.fn() }));

import {
  createTestUser, createTestPlan, createTestCourse, createTestChapter,
  createTestLesson, createTestOrder, linkCourseToPlan, createTestPurchase, cleanTestData,
} from "@/test/helpers";
import { db } from "@/lib/db";
import { users, userProgress } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock auth — toggleLessonComplete needs a valid session.
// Providing a factory so vitest doesn't resolve the real module (which
// would pull in next-auth → next/server and crash in test env).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { toggleLessonComplete } from "@/app/(protected)/courses/[courseId]/lessons/[lessonId]/actions";

let userId: string;
let courseId: string;
let lessonId: string;

beforeAll(async () => {
  await cleanTestData();

  const user = await createTestUser({ email: "test-lesson-unmark@example.com", role: "admin" });
  userId = user.id;
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));

  const plan = await createTestPlan({ name: "Lesson Unmark Test" });
  const order = await createTestOrder(userId, plan.id, { status: "completed" });
  const course = await createTestCourse({ title: "Lesson Unmark Course", status: "published" });
  courseId = course.id;
  await linkCourseToPlan(courseId, plan.id);
  await createTestPurchase(userId, plan.id, order.id, { grantedBy: "payment" });

  const chapter = await createTestChapter(courseId, { title: "Test Chapter" });
  const lesson = await createTestLesson(courseId, chapter.id, {
    title: "Test Unmark Lesson",
    type: "text",
    content: "# Hello",
    status: "published",
  });
  lessonId = lesson.id;
});

afterAll(async () => {
  await cleanTestData();
});

describe("toggleLessonComplete / unmark prevention", () => {
  it("cannot unmark an already-completed lesson", async () => {
    // Mock auth — first call
    // @ts-expect-error — mock return value has custom user fields added by session callback
    auth.mockResolvedValueOnce({
      user: { id: userId, role: "admin", email: "test-lesson-unmark@example.com" },
      expires: new Date(Date.now() + 3600000).toISOString(),
    });
    const markResult = await toggleLessonComplete(lessonId, true);
    expect(markResult.completed).toBe(true);
    expect(markResult.error).toBeUndefined();

    // Verify DB
    const progress1 = await db.query.userProgress.findFirst({
      where: eq(userProgress.lessonId, lessonId),
    });
    expect(progress1?.completed).toBe(true);

    // Mock auth — second call
    // @ts-expect-error — mock return value has custom user fields
    auth.mockResolvedValueOnce({
      user: { id: userId, role: "admin", email: "test-lesson-unmark@example.com" },
      expires: new Date(Date.now() + 3600000).toISOString(),
    });
    const unmarkResult = await toggleLessonComplete(lessonId, false);
    expect(unmarkResult.completed).toBe(true); // Still true — cannot unmark
    expect(unmarkResult.error).toBeUndefined();

    // Verify DB still shows completed
    const progress2 = await db.query.userProgress.findFirst({
      where: eq(userProgress.lessonId, lessonId),
    });
    expect(progress2?.completed).toBe(true);
  });

  it("allows marking complete when not yet completed", async () => {
    // Need a different lesson since existing one is already completed
    const chapter2 = await createTestChapter(courseId, { title: "Chapter 2" });
    const lesson2 = await createTestLesson(courseId, chapter2.id, {
      title: "Second Test Lesson",
      type: "text",
      content: "# Second",
      status: "published",
    });

    // @ts-expect-error — mock return value has custom user fields
    auth.mockResolvedValueOnce({
      user: { id: userId, role: "admin", email: "test-lesson-unmark@example.com" },
      expires: new Date(Date.now() + 3600000).toISOString(),
    });

    const result = await toggleLessonComplete(lesson2.id, true);
    expect(result.completed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
