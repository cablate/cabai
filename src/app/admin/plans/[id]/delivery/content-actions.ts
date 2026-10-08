"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, isNull } from "drizzle-orm";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { db } from "@/lib/db";
import { courses, planCourses, planContents, plans } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { bindMediaAssetsFromContent } from "@/lib/media-assets";

const createPlanContentSchema = z.object({
  planId: z.string().min(1, "缺少方案 ID"),
  title: z.string().min(1, "標題必填").max(200, "標題不能超過 200 字"),
  type: z.enum(["video", "pdf", "text", "download"], {
    required_error: "請選擇類型",
  }),
  content: z.string().min(1, "內容或連結必填"),
  sortOrder: z
    .string()
    .optional()
    .transform((value) => Number(value || "0")),
});

export type PlanContentActionResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
} | null;

function revalidateDeliveryPaths(planId: string) {
  revalidatePath(`/admin/plans/${planId}`);
  revalidatePath(`/admin/plans/${planId}/delivery`);
  revalidatePath("/admin/plans");
  revalidatePath(`/products/${planId}`);
  revalidatePath(`/content/${planId}`);
  revalidatePath("/dashboard");
}

async function refreshPlatformContentFlag(planId: string) {
  const [[courseCount], [contentCount]] = await Promise.all([
    db.select({ value: count() }).from(planCourses)
      .innerJoin(courses, eq(planCourses.courseId, courses.id))
      .where(and(eq(planCourses.planId, planId), isNull(planCourses.removedAt), isNull(courses.deletedAt))),
    db.select({ value: count() }).from(planContents)
      .where(and(eq(planContents.planId, planId), isNull(planContents.deletedAt))),
  ]);

  await db
    .update(plans)
    .set({ hasPlatformContent: (courseCount?.value ?? 0) + (contentCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

export async function createPlanContent(
  _prev: PlanContentActionResult,
  formData: FormData,
): Promise<PlanContentActionResult> {
  const session = await requireAdminAction("plan-delivery-content:create");

  const parsed = createPlanContentSchema.safeParse({
    planId: formData.get("planId"),
    title: formData.get("title"),
    type: formData.get("type"),
    content: formData.get("content"),
    sortOrder: formData.get("sortOrder") || "0",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { planId, title, type, content, sortOrder } = parsed.data;

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });

  if (!plan) {
    return { error: "找不到此方案" };
  }

  const [record] = await db.insert(planContents).values({
    planId,
    title,
    type,
    content,
    sortOrder,
  }).returning({ id: planContents.id });

  if (record) {
    await bindMediaAssetsFromContent(content, "planContent", record.id, session.user.id);
  }

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "create",
    entityType: "planContent",
    entityId: record?.id ?? "unknown",
    metadata: { planId, title, type },
  });

  await refreshPlatformContentFlag(planId);
  revalidateDeliveryPaths(planId);

  return { success: true };
}

export async function deletePlanContent(contentId: string, planId: string) {
  const session = await requireAdminAction("plan-delivery-content:delete");

  await db
    .update(planContents)
    .set({ deletedAt: new Date(), deletedBy: session.user.id })
    .where(and(eq(planContents.id, contentId), eq(planContents.planId, planId)));

  await writeAuditLog({
    actorType: "user",
    actorId: session.user.id,
    action: "delete",
    entityType: "planContent",
    entityId: contentId,
    metadata: { planId },
  });

  await refreshPlatformContentFlag(planId);
  revalidateDeliveryPaths(planId);
}
