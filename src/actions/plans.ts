"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  orders,
  planContents,
  planCourses,
  planPresentations,
  plans,
  userPurchases,
} from "@/lib/db/schema";
import { eq, and, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { createPortalyPlan, getPlan, updatePortalyPlan } from "@/lib/portaly-client";
import { syncPlans } from "@/lib/sync-plans";
import { validatePlanSlug } from "@/lib/validate-plan-slug";

function revalidatePlanPaths(planId?: string) {
  revalidatePath("/admin/plans");
  revalidatePath("/");
  revalidatePath("/products");
  if (planId) {
    revalidatePath(`/admin/plans/${planId}`);
    revalidatePath(`/products/${planId}`);
  }
  expirePublicSiteCache("plans");
}

// ─── Create Plan ───

const createPlanSchema = z.object({
  name: z.string().min(1, "方案名稱為必填"),
  description: z.string().optional(),
  amount: z.coerce.number().int().min(0, "金額不可為負"),
  currency: z.string().default("TWD"),
  billingPeriod: z.enum(["monthly", "yearly", "one-time"]),
  pricingType: z.enum(["fixed", "dynamic"]).default("fixed"),
  gateway: z.enum(["portaly", "manual"]).default("manual"),
  providerPlanId: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .min(1, "Provider plan ID is required when provided")
      .max(128, "Provider plan ID is too long")
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Provider plan ID can only contain letters, numbers, underscores, and hyphens")
      .optional(),
  ),
});

const planActionIdSchema = z
  .string()
  .trim()
  .min(1, "方案 ID 為必填")
  .max(128, "方案 ID 長度不正確")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "方案 ID 格式不正確");

function validateDynamicProviderBoundary(input: {
  billingPeriod: "monthly" | "yearly" | "one-time";
  pricingType: "fixed" | "dynamic";
  providerPlanId?: string | null;
  localPlanId?: string;
}): { fieldErrors: Record<string, string[]> } | null {
  if (input.pricingType === "dynamic" && input.billingPeriod !== "one-time") {
    return { fieldErrors: { billingPeriod: ["Dynamic pricing only supports one-time checkout"] } };
  }

  const usesSharedProviderPlan =
    !!input.providerPlanId && input.providerPlanId !== input.localPlanId;
  if (usesSharedProviderPlan && input.billingPeriod !== "one-time") {
    return { fieldErrors: { providerPlanId: ["Shared provider plans only support one-time checkout"] } };
  }

  return null;
}

export type CreatePlanResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
} | null;

export async function createPlan(
  _prev: CreatePlanResult,
  formData: FormData,
): Promise<CreatePlanResult> {
  await requireAdminAction("plan:create", { heavy: true });

  const parsed = createPlanSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency") || "TWD",
    billingPeriod: formData.get("billingPeriod"),
    pricingType: formData.get("pricingType") || "fixed",
    gateway: formData.get("gateway") || "manual",
    providerPlanId: formData.get("providerPlanId") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const boundaryError = validateDynamicProviderBoundary(data);
  if (boundaryError) return boundaryError;

  if (data.providerPlanId && data.gateway !== "portaly") {
    return { fieldErrors: { providerPlanId: ["Provider plan ID requires Portaly gateway"] } };
  }

  let newPlanId: string;

  if (data.gateway === "portaly" && !data.providerPlanId) {
    // Create on Portaly first, use returned planId
    const { data: portalyPlan, error } = await createPortalyPlan({
      name: data.name,
      description: data.description,
      amount: data.pricingType === "dynamic" ? undefined : data.amount,
      currency: data.currency,
      billingPeriod: data.billingPeriod,
      pricingType: data.pricingType,
      status: "active",
    });

    if (error || !portalyPlan) {
      return { error: `Portaly 建立失敗：${error ?? "未知錯誤"}` };
    }

    try {
      await db.insert(plans).values({
        id: portalyPlan.id,
        providerPlanId: portalyPlan.id,
        name: portalyPlan.name,
        description: portalyPlan.description ?? null,
        amount: portalyPlan.amount,
        currency: portalyPlan.currency,
        billingPeriod: portalyPlan.billingPeriod,
        pricingType: portalyPlan.pricingType ?? null,
        status: portalyPlan.status,
        image: portalyPlan.image ?? null,
        merchantPlanId: portalyPlan.merchantPlanId ?? null,
        gateway: "portaly",
        portalyCreatedAt: portalyPlan.createdAt,
        portalyUpdatedAt: portalyPlan.updatedAt,
        syncedAt: new Date(),
      });
    } catch (err) {
      return { error: `本地儲存失敗：${err instanceof Error ? err.message : String(err)}` };
    }

    newPlanId = portalyPlan.id;
  } else if (data.gateway === "portaly" && data.providerPlanId) {
    // Local product backed by an existing Portaly provider plan. This is used
    // for shared dynamic one-time checkout, so do not create or mutate the
    // provider plan here.
    newPlanId = crypto.randomUUID();
    try {
      await db.insert(plans).values({
        id: newPlanId,
        providerPlanId: data.providerPlanId,
        name: data.name,
        description: data.description ?? null,
        amount: data.amount,
        currency: data.currency,
        billingPeriod: data.billingPeriod,
        pricingType: data.pricingType,
        status: "active",
        gateway: "portaly",
        syncedAt: new Date(),
      });
    } catch (err) {
      return { error: `建立本地方案失敗：${err instanceof Error ? err.message : String(err)}` };
    }
  } else {
    // Manual plan: local only
    newPlanId = crypto.randomUUID();
    try {
      await db.insert(plans).values({
        id: newPlanId,
        name: data.name,
        description: data.description ?? null,
        amount: data.amount,
        currency: data.currency,
        billingPeriod: data.billingPeriod,
        pricingType: data.pricingType,
        status: "active",
        gateway: "manual",
        syncedAt: new Date(),
      });
    } catch (err) {
      return { error: `建立失敗：${err instanceof Error ? err.message : String(err)}` };
    }
  }

  revalidatePlanPaths(newPlanId);
  redirect(`/admin/plans/${newPlanId}`);
}

// ─── Update Plan ───

const updatePlanSchema = z.object({
  name: z.string().min(1, "方案名稱為必填"),
  description: z.string().optional(),
  amount: z.coerce.number().int().min(0, "金額不可為負"),
  billingPeriod: z.enum(["monthly", "yearly", "one-time"]),
  pricingType: z.enum(["fixed", "dynamic"]).default("fixed"),
  status: z.enum(["active", "inactive"]),
  gateway: z.enum(["portaly", "manual"]),
  // Empty string = clear the slug; non-empty goes through validatePlanSlug
  // and a unique pre-check below.
  slug: z.string().optional(),
  providerPlanId: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .min(1, "Provider plan ID is required when provided")
      .max(128, "Provider plan ID is too long")
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Provider plan ID can only contain letters, numbers, underscores, and hyphens")
      .nullable()
      .optional(),
  ),
});

export type UpdatePlanResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
} | null;

export async function updatePlan(
  planId: string,
  _prev: UpdatePlanResult,
  formData: FormData,
): Promise<UpdatePlanResult> {
  await requireAdminAction("plan:update");
  const parsedPlanId = planActionIdSchema.safeParse(planId);
  if (!parsedPlanId.success) {
    return { error: parsedPlanId.error.errors[0]?.message ?? "方案 ID 格式不正確" };
  }
  const safePlanId = parsedPlanId.data;

  const existing = await db.query.plans.findFirst({ where: eq(plans.id, safePlanId) });
  if (!existing) return { error: "方案不存在" };

  const parsed = updatePlanSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    billingPeriod: formData.get("billingPeriod"),
    pricingType: formData.get("pricingType") || "fixed",
    status: formData.get("status"),
    gateway: formData.get("gateway") || existing.gateway,
    slug: formData.get("slug") ?? undefined,
    providerPlanId: formData.has("providerPlanId")
      ? formData.get("providerPlanId")
      : undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const nextGateway = data.gateway;
  const nextProviderPlanId =
    data.providerPlanId !== undefined ? data.providerPlanId : existing.providerPlanId;
  const isConvertingToPortaly =
    existing.gateway === "manual" && nextGateway === "portaly";

  if (existing.gateway === "portaly" && nextGateway === "manual") {
    return {
      fieldErrors: {
        gateway: ["已使用 Portaly 的方案不能在此改回 Manual，請先處理既有付款與權限影響。"],
      },
    };
  }

  if (isConvertingToPortaly && !nextProviderPlanId) {
    return {
      fieldErrors: {
        providerPlanId: ["轉換為 Portaly 時必須填寫 Provider Plan ID。"],
      },
    };
  }

  if (isConvertingToPortaly && nextProviderPlanId === safePlanId) {
    return {
      fieldErrors: {
        providerPlanId: ["轉換時必須填寫另一個既有 Portaly 方案的 ID。"],
      },
    };
  }

  if (nextGateway === "manual" && nextProviderPlanId) {
    return {
      fieldErrors: {
        providerPlanId: ["Manual 方案不能設定 Portaly Provider Plan ID。"],
      },
    };
  }
  if (
    existing.gateway === "portaly" &&
    existing.providerPlanId &&
    existing.providerPlanId !== safePlanId &&
    data.providerPlanId === null
  ) {
    return { fieldErrors: { providerPlanId: ["Shared provider plan ID cannot be cleared"] } };
  }

  const boundaryError = validateDynamicProviderBoundary({
    billingPeriod: data.billingPeriod,
    pricingType: data.pricingType,
    providerPlanId: nextProviderPlanId,
    localPlanId: safePlanId,
  });
  if (boundaryError) return boundaryError;

  if (isConvertingToPortaly && nextProviderPlanId) {
    const { data: providerPlan, error } = await getPlan(nextProviderPlanId);
    if (error || !providerPlan) {
      return {
        fieldErrors: {
          providerPlanId: [`無法確認 Portaly 方案：${error ?? "找不到指定方案"}`],
        },
      };
    }

    if (providerPlan.id !== nextProviderPlanId) {
      return {
        fieldErrors: {
          providerPlanId: ["Portaly 回傳的方案 ID 與輸入值不一致。"],
        },
      };
    }

    if (
      providerPlan.status !== "active" ||
      providerPlan.billingPeriod !== "one-time" ||
      providerPlan.pricingType !== "dynamic" ||
      providerPlan.currency !== "TWD"
    ) {
      return {
        fieldErrors: {
          providerPlanId: ["轉換僅支援已啟用、TWD、一次性且可自訂金額的 Portaly 方案。"],
        },
      };
    }
  }

  // Resolve target slug: empty/undefined = clear; non-empty = validate.
  let slugUpdate: string | null | undefined = undefined; // undefined = no change
  const slugRaw = (data.slug ?? "").trim();
  if (slugRaw === "" && existing.slug !== null) {
    slugUpdate = null;
  } else if (slugRaw !== "") {
    const result = validatePlanSlug(slugRaw);
    if (!result.ok) {
      return { fieldErrors: { slug: [result.message] } };
    }
    if (result.slug !== existing.slug) {
      // Pre-check uniqueness so the user sees a friendly message instead of
      // a raw unique-violation. The partial index is still the backstop.
      const conflict = await db.query.plans.findFirst({
        where: and(eq(plans.slug, result.slug), ne(plans.id, safePlanId)),
        columns: { id: true },
      });
      if (conflict) {
        return { fieldErrors: { slug: ["此 slug 已被使用，請換一個"] } };
      }
      slugUpdate = result.slug;
    }
  }

  // Guard: block deactivation if plan has active subscriptions
  if (data.status === "inactive" && existing.status === "active") {
    const activeSubCount = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.planId, safePlanId),
          eq(orders.status, "completed"),
          inArray(orders.subscriptionStatus, ["active", "past_due"]),
        ),
      );
    if (activeSubCount.length > 0) {
      return {
        error: `此方案有 ${activeSubCount.length} 筆進行中的訂閱，請先取消所有訂閱再下架`,
      };
    }
  }

  try {
    const currentProviderPlanId = existing.providerPlanId ?? safePlanId;
    const nextProviderOwnedPlanId = nextProviderPlanId ?? safePlanId;
    const shouldUpdateProviderPlan =
      existing.gateway === "portaly" &&
      currentProviderPlanId === safePlanId &&
      nextProviderOwnedPlanId === safePlanId;

    if (shouldUpdateProviderPlan) {
      // Push to Portaly first
      const { error } = await updatePortalyPlan(currentProviderPlanId, {
        name: data.name,
        description: data.description,
        amount: data.pricingType === "dynamic" ? undefined : data.amount,
        billingPeriod: data.billingPeriod,
        pricingType: data.pricingType,
        status: data.status,
      });

      if (error) {
        return { error: `Portaly 同步失敗：${error}` };
      }
    }

    // Update local DB (both gateways)
    try {
      await db
        .update(plans)
        .set({
          name: data.name,
          description: data.description ?? null,
          amount: data.amount,
          billingPeriod: data.billingPeriod,
          pricingType: data.pricingType,
          status: data.status,
          gateway: nextGateway,
          ...(data.providerPlanId !== undefined ? { providerPlanId: data.providerPlanId } : {}),
          ...(slugUpdate !== undefined ? { slug: slugUpdate } : {}),
          syncedAt: new Date(),
        })
        .where(eq(plans.id, safePlanId));
    } catch (err) {
      // Defensive: partial unique index might still trip if a concurrent
      // request claimed the same slug between our pre-check and UPDATE.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("idx_plans_slug_unique") || msg.includes("unique")) {
        return { fieldErrors: { slug: ["此 slug 已被使用，請換一個"] } };
      }
      throw err;
    }
  } catch (err) {
    return { error: `更新失敗：${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePlanPaths(safePlanId);
  return { success: true };
}

// ─── Toggle Plan Status ───

export type TogglePlanStatusResult = {
  status?: string;
  error?: string;
};

export async function togglePlanStatus(
  planId: string,
): Promise<TogglePlanStatusResult> {
  await requireAdminAction("plan:toggle-status");
  const parsedPlanId = planActionIdSchema.safeParse(planId);
  if (!parsedPlanId.success) {
    return { error: parsedPlanId.error.errors[0]?.message ?? "方案 ID 格式不正確" };
  }
  const safePlanId = parsedPlanId.data;

  const existing = await db.query.plans.findFirst({ where: eq(plans.id, safePlanId) });
  if (!existing) return { error: "方案不存在" };

  const newStatus = existing.status === "active" ? "inactive" : "active";

  // Guard: block deactivation if plan has active subscriptions
  if (newStatus === "inactive") {
    const activeSubCount = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.planId, safePlanId),
          eq(orders.status, "completed"),
          inArray(orders.subscriptionStatus, ["active", "past_due"]),
        ),
      );
    if (activeSubCount.length > 0) {
      return {
        error: `此方案有 ${activeSubCount.length} 筆進行中的訂閱，請先取消所有訂閱再下架`,
      };
    }
  }

  try {
    const providerPlanId = existing.providerPlanId ?? safePlanId;
    const shouldUpdateProviderPlan =
      existing.gateway === "portaly" && providerPlanId === safePlanId;

    if (shouldUpdateProviderPlan) {
      const { error } = await updatePortalyPlan(providerPlanId, {
        name: existing.name,
        status: newStatus,
      });
      if (error) {
        return { error: `Portaly 同步失敗：${error}` };
      }
    }

    await db
      .update(plans)
      .set({ status: newStatus, syncedAt: new Date() })
      .where(eq(plans.id, safePlanId));
  } catch (err) {
    return { error: `切換失敗：${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePlanPaths(safePlanId);
  return { status: newStatus };
}

// ─── Delete Plan ───

export type DeletePlanResult = {
  error?: string;
  deleted?: boolean;
  archived?: boolean;
};

export async function deletePlan(planId: string): Promise<DeletePlanResult> {
  await requireAdminAction("plan:delete", { heavy: true });
  const parsedPlanId = planActionIdSchema.safeParse(planId);
  if (!parsedPlanId.success) {
    return { error: parsedPlanId.error.errors[0]?.message ?? "方案 ID 格式不正確" };
  }
  const safePlanId = parsedPlanId.data;

  const existing = await db.query.plans.findFirst({ where: eq(plans.id, safePlanId) });
  if (!existing) return { error: "方案不存在" };

  // Check if plan has any orders OR user_purchases (free_claim / manual grants
  // create user_purchases without an order — purely order-based check would
  // permit hard-delete that then violates the user_purchases FK).
  const [orderHit, purchaseHit] = await Promise.all([
    db.select({ id: orders.id }).from(orders).where(eq(orders.planId, safePlanId)).limit(1),
    db.select({ id: userPurchases.id }).from(userPurchases).where(eq(userPurchases.planId, safePlanId)).limit(1),
  ]);

  if (orderHit.length > 0 || purchaseHit.length > 0) {
    // Has activity — can only archive (set inactive), not delete
    await db
      .update(plans)
      .set({ status: "inactive", syncedAt: new Date() })
      .where(eq(plans.id, safePlanId));

    revalidatePlanPaths(safePlanId);
    return { archived: true };
  }

  // No orders or purchases — safe to hard delete
  // Delete related data first using typed Drizzle builders inside one transaction.
  await db.transaction(async (tx) => {
    await tx.delete(planCourses).where(eq(planCourses.planId, safePlanId));
    await tx.delete(planContents).where(eq(planContents.planId, safePlanId));
    await tx.delete(planPresentations).where(eq(planPresentations.planId, safePlanId));
    await tx.delete(plans).where(eq(plans.id, safePlanId));
  });

  revalidatePlanPaths(safePlanId);
  return { deleted: true };
}

// ─── Sync Plans from Portaly ───

export type SyncPlansResult = {
  synced?: number;
  error?: string;
} | null;

export async function syncPlansAction(): Promise<SyncPlansResult> {
  await requireAdminAction("plans:sync", { heavy: true });

  try {
    const result = await syncPlans();
    if (result.error) {
      return { error: result.error };
    }
    revalidatePlanPaths();
    return { synced: result.synced };
  } catch (err) {
    return { error: `同步失敗：${err instanceof Error ? err.message : String(err)}` };
  }
}
