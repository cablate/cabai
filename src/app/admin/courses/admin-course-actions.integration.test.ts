import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminAction, revalidatePath } = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin-action-guard", () => ({ requireAdminAction }));
vi.mock("next/cache", () => ({
  revalidatePath,
  revalidateTag: vi.fn(),
}));

import {
  archiveCourse as archiveAdminCourse,
  createCourse as createAdminCourse,
  deleteCourse as deleteAdminCourse,
  restoreCourse as restoreAdminCourse,
  updateCourse as updateAdminCourse,
} from "@/app/admin/courses/actions";
import { db } from "@/lib/db";
import { auditLogs, chapters, contentRevisions, courses, lessons } from "@/lib/db/schema";
import {
  cleanTestData,
  createTestChapter,
  createTestCourse,
  createTestLesson,
  createTestOrder,
  createTestPlan,
  createTestPurchase,
  createTestUser,
  linkCourseToPlan,
} from "@/test/helpers";
import { and, eq } from "drizzle-orm";

let adminId: string;

beforeEach(async () => {
  await cleanTestData();
  revalidatePath.mockReset();
  requireAdminAction.mockReset();

  const admin = await createTestUser({ role: "admin" });
  adminId = admin.id;
  requireAdminAction.mockResolvedValue({ user: { id: adminId } });
});

afterAll(async () => {
  await cleanTestData();
});

describe("Admin course actions / canonical service ownership", () => {
  it("creates, updates, and archives with the authenticated admin actor", async () => {
    const plan = await createTestPlan({ name: "Admin Course Plan" });
    const createForm = new FormData();
    createForm.set("planId", plan.id);
    createForm.set("title", "Admin Created Course");
    createForm.set("description", "Before update");

    const created = await createAdminCourse(null, createForm);
    expect(created).toMatchObject({ success: true });
    expect(created?.courseId).toBeTruthy();

    const courseId = created!.courseId!;
    const updateForm = new FormData();
    updateForm.set("title", "Admin Updated Course");
    updateForm.set("description", "After update");

    await expect(updateAdminCourse(courseId, updateForm)).resolves.toEqual({ success: true });
    await expect(archiveAdminCourse(courseId)).resolves.toEqual({ success: true });

    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    expect(course).toMatchObject({ title: "Admin Updated Course", status: "archived" });

    const revision = await db.query.contentRevisions.findFirst({
      where: eq(contentRevisions.entityId, courseId),
    });
    expect(revision).toBeTruthy();

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, courseId));
    expect(audits).toHaveLength(3);
    expect(audits.every((audit) => audit.actorType === "user" && audit.actorId === adminId)).toBe(true);
    expect(requireAdminAction).toHaveBeenCalledWith("course:create");
    expect(requireAdminAction).toHaveBeenCalledWith("course:update");
    expect(requireAdminAction).toHaveBeenCalledWith("course:archive");
  });

  it("blocks Admin deletion when a published linked course has an active purchase", async () => {
    const member = await createTestUser();
    const plan = await createTestPlan({ name: "Protected Course Plan" });
    const course = await createTestCourse({ title: "Protected Course", status: "published" });
    const chapter = await createTestChapter(course.id);
    const lesson = await createTestLesson(course.id, chapter.id, { status: "published" });
    await linkCourseToPlan(course.id, plan.id);
    const order = await createTestOrder(member.id, plan.id, { status: "completed" });
    await createTestPurchase(member.id, plan.id, order.id);

    const result = await deleteAdminCourse(course.id);
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("無法刪除已發佈且有用戶購買的課程"),
    });

    const [storedCourse, storedChapter, storedLesson] = await Promise.all([
      db.query.courses.findFirst({ where: eq(courses.id, course.id) }),
      db.query.chapters.findFirst({ where: eq(chapters.id, chapter.id) }),
      db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) }),
    ]);
    expect(storedCourse?.deletedAt).toBeNull();
    expect(storedChapter?.deletedAt).toBeNull();
    expect(storedLesson?.deletedAt).toBeNull();

    const deleteAudit = await db.query.auditLogs.findFirst({
      where: and(eq(auditLogs.entityId, course.id), eq(auditLogs.action, "delete")),
    });
    expect(deleteAudit).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("soft-deletes and restores a draft course through the same service", async () => {
    const plan = await createTestPlan({ name: "Restorable Course Plan" });
    const course = await createTestCourse({ title: "Restorable Course" });
    const chapter = await createTestChapter(course.id);
    const lesson = await createTestLesson(course.id, chapter.id);
    await linkCourseToPlan(course.id, plan.id);

    await expect(deleteAdminCourse(course.id)).resolves.toEqual({ success: true });

    const deleted = await db.query.courses.findFirst({ where: eq(courses.id, course.id) });
    expect(deleted?.deletedAt).toBeTruthy();
    expect(deleted?.deletedBy).toBe(adminId);

    const deletedChapter = await db.query.chapters.findFirst({ where: eq(chapters.id, chapter.id) });
    const deletedLesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) });
    expect(deletedChapter?.deletedBy).toBe(adminId);
    expect(deletedLesson?.deletedBy).toBe(adminId);

    await restoreAdminCourse(course.id);

    const [restoredCourse, restoredChapter, restoredLesson] = await Promise.all([
      db.query.courses.findFirst({ where: eq(courses.id, course.id) }),
      db.query.chapters.findFirst({ where: eq(chapters.id, chapter.id) }),
      db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) }),
    ]);
    expect(restoredCourse?.deletedAt).toBeNull();
    expect(restoredChapter?.deletedAt).toBeNull();
    expect(restoredLesson?.deletedAt).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/courses");
    expect(revalidatePath).toHaveBeenCalledWith(`/products/${plan.id}`);
  });
});
