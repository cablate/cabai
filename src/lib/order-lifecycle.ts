/**
 * order-lifecycle.ts — Shared order completion and subscription sync logic.
 *
 * Extracted from callback/route.ts and reconcile.ts to eliminate duplication.
 * Both paths (callback + reconciliation) now call these shared functions.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSubscription } from "@/lib/portaly";
import { createLogger } from "@/lib/logger";
import { ensurePaymentPurchaseInTransaction } from "@/lib/entitlement-transitions";
import {
  normalizePortalySubscriptionFields,
  type SubscriptionFields,
} from "@/lib/subscription-state";

export type { SubscriptionFields } from "@/lib/subscription-state";

const logger = createLogger("order-lifecycle");

// ─── Types ───

export type OrderCompletionData = {
  subscriptionId?: string | null;
  paidAmount?: number | null;
  paymentMethod?: string | null;
  callbackPayload?: Record<string, unknown> | null;
  triggeredBy?: string;
};

export type CompleteOrderResult = {
  completed: boolean;
  wasAlreadyCompleted: boolean;
  purchaseCreated: boolean;
};

// ─── Subscription field fetching ───

/**
 * Fetch subscription fields from Portaly and normalize into a flat object.
 * Returns empty fields on error (non-fatal).
 */
export async function fetchSubscriptionFields(
  subscriptionId: string,
): Promise<SubscriptionFields> {
  const empty: SubscriptionFields = {
    subscriptionStatus: null,
    cancelAtPeriodEnd: false,
    cancelEffectiveAt: null,
    nextBillingAt: null,
  };

  try {
    const { data: sub } = await getSubscription(subscriptionId);
    if (!sub) return empty;

    return normalizePortalySubscriptionFields(sub);
  } catch (err) {
    logger.error("Failed to fetch subscription", { error: err instanceof Error ? err.message : String(err) });
    return empty;
  }
}

// ─── Order completion ───

/**
 * Complete an order atomically: update status + subscription fields + insert userPurchase.
 *
 * Used by both callback handler and reconciliation.
 * Idempotent: if order is already completed, only ensures userPurchase exists.
 */
export async function completeOrder(
  orderId: string,
  userId: string,
  planId: string,
  data: OrderCompletionData,
): Promise<CompleteOrderResult> {
  const result: CompleteOrderResult = {
    completed: false,
    wasAlreadyCompleted: false,
    purchaseCreated: false,
  };

  // Check current order status
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) return result;

  // Already completed — only ensure userPurchase exists
  if (order.status === "completed") {
    result.wasAlreadyCompleted = true;
    result.completed = true;
    result.purchaseCreated = await ensureUserPurchase(userId, planId, orderId, {
      source: order.subscriptionId ? "subscription" : "payment",
      triggeredBy: data.triggeredBy ?? "order-lifecycle.replay",
    });
    return result;
  }

  // Only pending orders can be completed (state machine guard)
  if (order.status !== "pending") {
    logger.warn("Cannot complete order in unexpected status", { orderId, status: order.status });
    return result;
  }

  // Fetch subscription fields if we have a subscription ID
  const resolvedSubId = data.subscriptionId ?? null;
  let subFields: SubscriptionFields | Record<string, never> = {};
  if (resolvedSubId) {
    subFields = await fetchSubscriptionFields(resolvedSubId);
  }

  // Transaction: update order status + insert userPurchase atomically.
  // WHERE status = 'pending' prevents race conditions (optimistic lock).
  try {
    const txResult = await db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({
          status: "completed",
          subscriptionId: resolvedSubId,
          paidAmount: data.paidAmount ?? null,
          paymentMethod: data.paymentMethod ?? null,
          callbackPayload: data.callbackPayload ?? null,
          updatedAt: new Date(),
          ...subFields,
        })
        .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
        .returning({ id: orders.id });

      if (updated.length === 0) {
        // Another request already completed this order — treat as idempotent success
        return { race: true } as const;
      }

      const purchase = await ensurePaymentPurchaseInTransaction(tx, {
        userId,
        planId,
        orderId,
        source: resolvedSubId ? "subscription" : "payment",
        triggeredBy: data.triggeredBy ?? "order-lifecycle.complete",
      });

      return { race: false, purchaseCreated: purchase.created } as const;
    });

    if (txResult.race) {
      logger.info("Order already completed by concurrent request", { orderId });
      result.wasAlreadyCompleted = true;
      result.completed = true;
      result.purchaseCreated = await ensureUserPurchase(userId, planId, orderId, {
        source: resolvedSubId ? "subscription" : "payment",
        triggeredBy: data.triggeredBy ?? "order-lifecycle.race-repair",
      });
      return result;
    }

    result.completed = true;
    result.purchaseCreated = txResult.purchaseCreated;
    return result;
  } catch (err) {
    logger.error("Transaction failed during order completion", { orderId, error: err instanceof Error ? err.message : String(err) });
    return result; // result.completed remains false — transaction auto-rolled back
  }
}

// ─── User purchase ───

/**
 * Ensure a userPurchase record exists for the given order.
 * Uses ON CONFLICT DO NOTHING for race-condition safety.
 * Returns true if a NEW record was created.
 */
export async function ensureUserPurchase(
  userId: string,
  planId: string,
  orderId: string,
  options: {
    source?: "payment" | "subscription" | "marketplace";
    triggeredBy?: string;
  } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await ensurePaymentPurchaseInTransaction(tx, {
      userId,
      planId,
      orderId,
      source: options.source ?? "payment",
      triggeredBy: options.triggeredBy ?? "order-lifecycle.ensure-purchase",
    });
    return result.created;
  });
}
