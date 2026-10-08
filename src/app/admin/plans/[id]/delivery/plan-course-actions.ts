"use server";

import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { db } from "@/lib/db";
import { planCourses, courses } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/audit";

export async function addCourseToPlan(
  planId: string,
  courseId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-course:add");

    // Verify course exists
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
    });
    if (!course) return { success: false, error: "課程不存在" };

    // Check duplicate
    const existing = await db.query.planCourses.findFirst({
      where: and(
        eq(planCourses.planId, planId),
        eq(planCourses.courseId, courseId),
      ),
    });

    if (existing && !existing.removedAt) {
      return { success: false, error: "此課程已在方案中" };
    }

    if (existing && existing.removedAt) {
      // Re-activate previously removed mapping
      await db
        .update(planCourses)
        .set({ removedAt: null })
        .where(eq(planCourses.id, existing.id));
    } else {
      await db.insert(planCourses).values({ planId, courseId }).onConflictDoNothing();
    }

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "create",
      entityType: "planCourse",
      entityId: `${planId}:${courseId}`,
      metadata: { planId, courseId, courseTitle: course.title },
    });

    revalidatePath(`/admin/plans/${planId}/delivery`);
    revalidatePath(`/admin/plans/${planId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "新增失敗" };
  }
}

export async function removeCoursFromPlan(
  planId: string,
  courseId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-course:remove");

    // Soft remove — set removedAt for grandfather protection
    const result = await db
      .update(planCourses)
      .set({ removedAt: new Date() })
      .where(and(
        eq(planCourses.planId, planId),
        eq(planCourses.courseId, courseId),
        isNull(planCourses.removedAt),
      ))
      .returning({ id: planCourses.id });

    if (result.length === 0) {
      return { success: false, error: "找不到此映射" };
    }

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "delete",
      entityType: "planCourse",
      entityId: `${planId}:${courseId}`,
      metadata: { planId, courseId },
    });

    revalidatePath(`/admin/plans/${planId}/delivery`);
    revalidatePath(`/admin/plans/${planId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "移除失敗" };
  }
}
