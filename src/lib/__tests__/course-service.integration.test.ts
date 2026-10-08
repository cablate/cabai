/**
 * Phase 4: Course CRUD + Publish — C1-C8, D1-D7
 * Tests course service guards, cascade, validation, and publish flow.
 * Real DB.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock Next.js server functions not available in test environment
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
import {
  createTestUser, createTestPlan, createTestCourse, createTestChapter,
  createTestLesson, createTestPurchase, createTestOrder, createTestPresentation,
  linkCourseToPlan, cleanTestData,
} from "@/test/helpers";
import {
  archiveCourseStatus, createCourse, updateCourse, deleteCourse, restoreCourse,
  createLesson, updateLesson,
  unarchiveCourseStatus,
} from "@/lib/services/course-service";
import { validateCourseReadiness } from "@/lib/course-validation";
import { publishCourseBundle } from "@/lib/course-publish";
import { getCourseOutlineSnapshot, reorderCourseOutline } from "@/lib/course-outline";
import { db } from "@/lib/db";
import { courses, chapters, lessons, auditLogs, contentRevisions, planPresentations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const actor = { type: "agent" as const, id: "test-agent" };
let userId: string;
let planId: string;

beforeAll(async () => {
  await cleanTestData();
  const user = await createTestUser({ email: "test-course@example.com" });
  userId = user.id;
  const plan = await createTestPlan({ name: "Course Test Plan" });
  planId = plan.id;
});

afterAll(async () => {
  await cleanTestData();
});

// ─── C: Course CRUD ───

describe("Course Service / CRUD (C1-C6)", () => {
  it("C1: create course → DB has record + audit log", async () => {
    const course = await createCourse({ title: "C1 Course", planId }, actor);
    expect(course.id).toBeTruthy();

    const dbCourse = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(dbCourse?.title).toBe("C1 Course");
    expect(dbCourse?.status).toBe("draft");

    // Check audit log
    const audit = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.entityId, course.id),
    });
    expect(audit?.action).toBe("create");
    expect(audit?.actorType).toBe("agent");
  });

  it("C2: update course → revision snapshot exists", async () => {
    const course = await createCourse({ title: "C2 Before", planId }, actor);
    await updateCourse(course.id, { title: "C2 After" }, actor);

    const revision = await db.query.contentRevisions.findFirst({
      where: eq(contentRevisions.entityId, course.id),
    });
    expect(revision).toBeTruthy();
    expect(revision?.entityType).toBe("course");
  });

  it("C3: delete draft course → cascade soft-deletes chapters + lessons", async () => {
    const course = await createTestCourse({ title: "C3 Course" });
    const chapter = await createTestChapter(course.id, { title: "C3 Ch" });
    await createTestLesson(course.id, chapter.id, { title: "C3 Lesson" });

    await deleteCourse(course.id, actor);

    const dbCourse = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(dbCourse?.deletedAt).toBeTruthy();

    // Chapters and lessons also soft-deleted
    const dbChapters = await db.select().from(chapters).where(eq(chapters.courseId, course.id));
    for (const ch of dbChapters) {
      expect(ch.deletedAt).toBeTruthy();
    }
    const dbLessons = await db.select().from(lessons).where(eq(lessons.courseId, course.id));
    for (const l of dbLessons) {
      expect(l.deletedAt).toBeTruthy();
    }
  });

  it("C4: delete published course with active purchases → BLOCKED", async () => {
    const course = await createTestCourse({ title: "C4 Published", status: "published" });
    await linkCourseToPlan(course.id, planId);
    const order = await createTestOrder(userId, planId, { status: "completed" });
    await createTestPurchase(userId, planId, order.id);

    await expect(deleteCourse(course.id, actor)).rejects.toThrow("無法刪除已發佈且有用戶購買的課程");
  });

  it("C5: restore course → course + chapters + lessons restored", async () => {
    const course = await createTestCourse({ title: "C5 Course" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id);

    // Delete then restore
    await deleteCourse(course.id, actor);
    await restoreCourse(course.id, actor);

    const dbCourse = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(dbCourse?.deletedAt).toBeNull();

    const activeChapters = await db.select().from(chapters)
      .where(eq(chapters.courseId, course.id));
    expect(activeChapters.every((c) => c.deletedAt === null)).toBe(true);
  });

  it("C6: title > 200 chars → throws", async () => {
    const longTitle = "A".repeat(201);
    await expect(createCourse({ title: longTitle }, actor)).rejects.toThrow("200");
  });

  it("C7: archive and unarchive status transitions use the canonical service", async () => {
    const course = await createTestCourse({ title: "C7 Status Course", status: "draft" });

    await archiveCourseStatus(course.id, actor);
    const archived = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(archived?.status).toBe("archived");

    await unarchiveCourseStatus(course.id, { ...actor, name: "Test Agent" });
    const restoredDraft = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(restoredDraft?.status).toBe("draft");

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, course.id));
    expect(audits).toHaveLength(2);
    expect(audits.every((audit) => audit.actorType === "agent" && audit.actorId === actor.id)).toBe(true);
  });

  it("C6b: lesson content > 100K chars → throws", async () => {
    const course = await createTestCourse();
    const chapter = await createTestChapter(course.id);
    const longContent = "X".repeat(100001);

    await expect(
      createLesson({
        courseId: course.id,
        chapterId: chapter.id,
        title: "Big Lesson",
        type: "text",
        content: longContent,
      }, actor),
    ).rejects.toThrow("100000");
  });

  it("C6c: lesson resources are stored and video URLs are normalized", async () => {
    const course = await createTestCourse({ title: "C6c Course" });
    const chapter = await createTestChapter(course.id);

    const lesson = await createLesson({
      courseId: course.id,
      chapterId: chapter.id,
      title: "Article With Resources",
      type: "video",
      content: "https://youtu.be/main123",
      resourcesJson: [
        {
          id: "resource-video",
          type: "video",
          title: "補充影片",
          url: "https://www.youtube.com/watch?v=extra123",
          sortOrder: 0,
        },
        {
          id: "resource-download",
          type: "download",
          title: "範例 ZIP",
          url: "/api/assets/example-zip",
          sortOrder: 1,
        },
      ],
    }, actor);

    const dbLesson = await db.query.lessons.findFirst({
      where: eq(lessons.id, lesson.id),
    });
    const resources = dbLesson?.resourcesJson as Array<{ id: string; url: string }>;

    expect(dbLesson?.content).toBe("https://www.youtube.com/embed/main123");
    expect(resources).toEqual([
      expect.objectContaining({
        id: "resource-video",
        url: "https://www.youtube.com/embed/extra123",
      }),
      expect.objectContaining({
        id: "resource-download",
        url: "/api/assets/example-zip",
      }),
    ]);

    await updateLesson(lesson.id, {
      resourcesJson: [
        {
          id: "resource-link",
          type: "link",
          title: "參考連結",
          url: "https://example.com",
          sortOrder: 0,
        },
      ],
    }, actor);

    const updated = await db.query.lessons.findFirst({
      where: eq(lessons.id, lesson.id),
    });
    expect(updated?.resourcesJson).toEqual([
      expect.objectContaining({
        id: "resource-link",
        url: "https://example.com",
        sortOrder: 0,
      }),
    ]);
  });

  it("WP-09: new lessons stay draft and regular updates cannot publish them", async () => {
    const course = await createTestCourse({ title: "WP-09 Draft Course" });
    const chapter = await createTestChapter(course.id);
    const lesson = await createLesson({
      courseId: course.id,
      chapterId: chapter.id,
      title: "Draft Lesson",
      type: "text",
      content: "Draft content",
    }, actor);

    const created = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(created?.status).toBe("draft");

    await expect(updateLesson(lesson.id, { status: "published" }, actor)).rejects.toThrow(
      "course bundle coordinator",
    );

    const blocked = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(blocked?.status).toBe("draft");
  });

  it("WP-09: published lessons keep normal content edits and may return to draft", async () => {
    const course = await createTestCourse({ title: "WP-09 Published Course" });
    const chapter = await createTestChapter(course.id);
    const lesson = await createTestLesson(course.id, chapter.id, {
      title: "Published Lesson",
      type: "text",
      content: "Before",
      status: "published",
    });

    await updateLesson(lesson.id, { content: "After" }, actor);
    const edited = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(edited).toMatchObject({ content: "After", status: "published" });

    await updateLesson(lesson.id, { title: "Corrected", status: "published" }, actor);
    const corrected = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(corrected).toMatchObject({ title: "Corrected", status: "published" });

    await updateLesson(lesson.id, { status: "draft" }, actor);
    const materialUpdate = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(materialUpdate?.status).toBe("draft");
  });
});

// ─── D: Publish flow ───

describe("Course Validation / Readiness (D1-D5)", () => {
  it("D1: complete course → ready: true", async () => {
    const course = await createTestCourse({ title: "D1 Complete", description: "Desc", image: "img.jpg" });
    await linkCourseToPlan(course.id, planId);
    await createTestPresentation(planId);
    const chapter = await createTestChapter(course.id, { title: "Ch 1" });
    await createTestLesson(course.id, chapter.id, { content: "https://video.mp4", isPreview: true });

    const result = await validateCourseReadiness(course.id);
    expect(result.ready).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("D2: no chapters → error, ready: false", async () => {
    const course = await createTestCourse({ title: "D2 Empty" });
    await linkCourseToPlan(course.id, planId);
    await createTestPresentation(planId);

    const result = await validateCourseReadiness(course.id);
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.severity === "error" && i.field === "chapters")).toBe(true);
  });

  it("D3: chapter without lessons → error per chapter", async () => {
    const course = await createTestCourse({ title: "D3 EmptyChapter" });
    await linkCourseToPlan(course.id, planId);
    await createTestPresentation(planId);
    await createTestChapter(course.id, { title: "Empty Chapter" });

    const result = await validateCourseReadiness(course.id);
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.severity === "error" && i.field === "chapter.lessons")).toBe(true);
  });

  it("D4: lesson without content → error", async () => {
    const course = await createTestCourse({ title: "D4 NoContent" });
    await linkCourseToPlan(course.id, planId);
    await createTestPresentation(planId);
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id, { content: "" });

    const result = await validateCourseReadiness(course.id);
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.severity === "error" && i.field === "lesson.content")).toBe(true);
  });

  it("D5: no plan linked → error", async () => {
    const course = await createTestCourse({ title: "D5 Orphan" });
    // No linkCourseToPlan

    const result = await validateCourseReadiness(course.id);
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.severity === "error" && i.field === "plan")).toBe(true);
  });
});

describe("Course Publish / publishCourseBundle (D6-D7)", () => {
  it("D6: ready course → all layers become published", async () => {
    const course = await createTestCourse({ title: "D6 Publish", description: "D", image: "i.jpg" });
    await linkCourseToPlan(course.id, planId);
    const presentation = await createTestPresentation(planId);
    const chapter = await createTestChapter(course.id);
    const draftLesson = await createTestLesson(course.id, chapter.id, { content: "https://v.mp4", isPreview: true });
    const alreadyPublished = await createTestLesson(course.id, chapter.id, { status: "published" });
    const deletedDraft = await createTestLesson(course.id, chapter.id);
    await db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, deletedDraft.id));

    const result = await publishCourseBundle(course.id, { type: "agent", id: "test-agent" });
    expect(result.success).toBe(true);

    const dbCourse = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(dbCourse?.status).toBe("published");

    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, draftLesson.id) }))
      .toMatchObject({ status: "published" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, alreadyPublished.id) }))
      .toMatchObject({ status: "published" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, deletedDraft.id) }))
      .toMatchObject({ status: "draft" });
    expect((await db.query.planPresentations.findFirst({
      where: eq(planPresentations.id, presentation.id),
    }))?.publishedAt).toBeInstanceOf(Date);

    const audit = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.entityId, course.id),
    });
    expect(audit?.action).toBe("publish");
    expect(audit?.actorType).toBe("agent");
    expect(audit?.actorId).toBe("test-agent");
  });

  it("D7: not-ready course → publish blocked", async () => {
    const course = await createTestCourse({ title: "D7 NotReady" });
    // No chapters, no plan link

    const result = await publishCourseBundle(course.id, { type: "agent", id: "test-agent" });
    expect(result.success).toBe(false);
    expect(result.validation.ready).toBe(false);
    expect(result.validation.issues.some((issue) => issue.severity === "error")).toBe(true);

    // Course should still be draft
    const dbCourse = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(dbCourse?.status).toBe("draft");
  });
});

describe("Course Outline / transactional reorder", () => {
  it("moves lessons across chapters and rewrites contiguous order", async () => {
    const course = await createTestCourse({ title: "Outline Move" });
    const first = await createTestChapter(course.id, { title: "First", sortOrder: 8 });
    const second = await createTestChapter(course.id, { title: "Second", sortOrder: 3 });
    const lessonA = await createTestLesson(course.id, first.id, { title: "A" });
    const lessonB = await createTestLesson(course.id, first.id, { title: "B" });
    const lessonC = await createTestLesson(course.id, second.id, { title: "C" });
    const snapshot = await getCourseOutlineSnapshot(course.id);

    const result = await reorderCourseOutline({
      courseId: course.id,
      expectedRevision: snapshot.revision,
      chapters: [
        { id: first.id, lessons: [{ id: lessonA.id }] },
        { id: second.id, lessons: [{ id: lessonC.id }, { id: lessonB.id }] },
      ],
    }, actor);

    expect(result.success).toBe(true);
    const saved = await getCourseOutlineSnapshot(course.id);
    expect(saved.chapters.map((chapter) => chapter.id)).toEqual([first.id, second.id]);
    expect(saved.chapters[0]?.lessons.map((lesson) => lesson.id)).toEqual([lessonA.id]);
    expect(saved.chapters[1]?.lessons.map((lesson) => lesson.id)).toEqual([lessonC.id, lessonB.id]);
    expect(saved.chapters[1]?.lessons.map((lesson) => lesson.sortOrder)).toEqual([0, 1]);
  });

  it("rejects stale revisions without overwriting the newer outline", async () => {
    const course = await createTestCourse({ title: "Outline Conflict" });
    const first = await createTestChapter(course.id, { title: "First" });
    const second = await createTestChapter(course.id, { title: "Second" });
    const snapshot = await getCourseOutlineSnapshot(course.id);
    const firstSave = await reorderCourseOutline({
      courseId: course.id,
      expectedRevision: snapshot.revision,
      chapters: [{ id: second.id, lessons: [] }, { id: first.id, lessons: [] }],
    }, actor);
    expect(firstSave.success).toBe(true);

    const staleSave = await reorderCourseOutline({
      courseId: course.id,
      expectedRevision: snapshot.revision,
      chapters: [{ id: first.id, lessons: [] }, { id: second.id, lessons: [] }],
    }, actor);
    expect(staleSave).toMatchObject({ success: false, status: "conflict" });
    const saved = await getCourseOutlineSnapshot(course.id);
    expect(saved.chapters.map((chapter) => chapter.id)).toEqual([second.id, first.id]);
  });

  it("rejects incomplete outlines", async () => {
    const course = await createTestCourse({ title: "Outline Incomplete" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id, { title: "Required lesson" });
    const snapshot = await getCourseOutlineSnapshot(course.id);
    const result = await reorderCourseOutline({
      courseId: course.id,
      expectedRevision: snapshot.revision,
      chapters: [{ id: chapter.id, lessons: [] }],
    }, actor);
    expect(result).toMatchObject({ success: false, status: "invalid" });
  });
});
