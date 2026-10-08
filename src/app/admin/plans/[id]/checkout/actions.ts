"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { createLogger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { writeAuditLog, computeChanges } from "@/lib/audit";

const logger = createLogger("checkout-action");

const checkoutConfigSchema = z.discriminatedUnion("purchaseButtonMode", [
  z.object({
    purchaseButtonMode: z.literal("internal"),
    externalCheckoutUrl: z.string().optional(),
    externalCheckoutLabel: z.string().optional(),
    externalCheckoutNewTab: z.boolean().optional(),
  }),
  z.object({
    purchaseButtonMode: z.literal("disabled"),
    externalCheckoutUrl: z.string().optional(),
    externalCheckoutLabel: z.string().optional(),
    externalCheckoutNewTab: z.boolean().optional(),
  }),
  z.object({
    purchaseButtonMode: z.literal("free_claim"),
    externalCheckoutUrl: z.string().optional(),
    externalCheckoutLabel: z.string().optional(),
    externalCheckoutNewTab: z.boolean().optional(),
  }),
  z.object({
    purchaseButtonMode: z.literal("external"),
    externalCheckoutUrl: z.string().url("必須為有效的 URL 格式"),
    externalCheckoutLabel: z.string().optional(),
    externalCheckoutNewTab: z.boolean(),
  }),
]);

export type CheckoutConfigInput = z.infer<typeof checkoutConfigSchema>;

export async function updatePlanCheckoutAction(
  planId: string,
  input: CheckoutConfigInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-checkout:update");

    const parsed = checkoutConfigSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return { success: false, error: firstError?.message ?? "驗證失敗" };
    }

    const data = parsed.data;

    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      columns: {
        id: true,
        purchaseButtonMode: true,
        externalCheckoutUrl: true,
        externalCheckoutLabel: true,
        externalCheckoutNewTab: true,
      },
    });

    if (!existing) {
      return { success: false, error: "方案不存在" };
    }

    const updateValues: {
      purchaseButtonMode: "internal" | "external" | "disabled" | "free_claim";
      externalCheckoutUrl: string | null;
      externalCheckoutLabel: string | null;
      externalCheckoutNewTab: boolean;
      updatedAt: Date;
    } = {
      purchaseButtonMode: data.purchaseButtonMode,
      externalCheckoutUrl:
        data.purchaseButtonMode === "external"
          ? (data.externalCheckoutUrl ?? null)
          : null,
      externalCheckoutLabel:
        data.purchaseButtonMode === "external"
          ? (data.externalCheckoutLabel ?? null) || null
          : null,
      externalCheckoutNewTab:
        data.purchaseButtonMode === "external"
          ? (data.externalCheckoutNewTab ?? true)
          : true,
      updatedAt: new Date(),
    };

    await db.update(plans).set(updateValues).where(eq(plans.id, planId));

    const changes = computeChanges(
      {
        purchaseButtonMode: existing.purchaseButtonMode,
        externalCheckoutUrl: existing.externalCheckoutUrl,
        externalCheckoutLabel: existing.externalCheckoutLabel,
        externalCheckoutNewTab: existing.externalCheckoutNewTab,
      },
      {
        purchaseButtonMode: updateValues.purchaseButtonMode,
        externalCheckoutUrl: updateValues.externalCheckoutUrl,
        externalCheckoutLabel: updateValues.externalCheckoutLabel,
        externalCheckoutNewTab: updateValues.externalCheckoutNewTab,
      }
    );

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "update",
      entityType: "plan",
      entityId: planId,
      changes,
      metadata: { section: "checkout" },
    });

    revalidatePath(`/admin/plans/${planId}`);
    revalidatePath(`/admin/plans/${planId}/checkout`);
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/products");

    logger.info("plan checkout config updated", {
      planId,
      userId: session.user.id,
      mode: data.purchaseButtonMode,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to update plan checkout config", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "更新失敗，請稍後再試" };
  }
}
