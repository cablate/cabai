/**
 * Subscription reconciliation job.
 *
 * Scans all active subscription orders, queries Portaly for current status,
 * and updates local records + triggers entitlement revocation if needed.
 *
 * Also cleans up stale pending orders without a provider session (>24h → expired).
 */
import { db } from "@/lib/db";
import { orders, userPurchases, type Order } from "@/lib/db/schema";
import { eq, and, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { ensureUserPurchase } from "@/lib/order-lifecycle";
import { getSubscription } from "@/lib/portaly";
import { reconcileOrderSubscriptionState } from "@/lib/entitlement-transitions";
import { normalizePortalySubscriptionFields } from "@/lib/subscription-state";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";

const logger = createLogger("reconcile-subscriptions");

export interface ReconciliationResult {
  scanned: number;
  updated: number;
  revoked: number;
  errors: number;
  staleCleanedUp: number;
  orphansRepaired: number;
  stale?: boolean;
  postStateFingerprint?: string;
}

export interface SubscriptionProviderSnapshot {
  bySubscriptionId: Record<string, { data?: Record<string, unknown>; error?: string }>;
  externalCalls: number;
}

export async function loadSubscriptionProviderSnapshot(): Promise<SubscriptionProviderSnapshot> {
  const activeOrders = await db
    .select({ subscriptionId: orders.subscriptionId })
    .from(orders)
    .where(and(inArray(orders.status, ["completed", "canceled"]), isNotNull(orders.subscriptionId)));
  const bySubscriptionId: SubscriptionProviderSnapshot["bySubscriptionId"] = {};
  const subscriptionIds = [...new Set(activeOrders.map((order) => order.subscriptionId).filter((id): id is string => Boolean(id)))];
  for (const subscriptionId of subscriptionIds) {
    const { data, error } = await getSubscription(subscriptionId);
    bySubscriptionId[subscriptionId] = { ...(data ? { data } : {}), ...(error ? { error } : {}) };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { bySubscriptionId, externalCalls: subscriptionIds.length };
}

/**
 * Run full subscription reconciliation.
 * Called by cron API route or manually from admin.
 */
export async function runSubscriptionReconciliation(
  providerSnapshot?: SubscriptionProviderSnapshot,
  options: { triggeredBy?: string; ensureFresh?: () => Promise<boolean>; capturePostState?: () => Promise<string> } = {},
): Promise<ReconciliationResult> {
  const locked = await withCronLock("provider-sync:subscriptions:mutation", async () => {
    if (options.ensureFresh && !(await options.ensureFresh())) {
      return { scanned: 0, updated: 0, revoked: 0, errors: 0, staleCleanedUp: 0, orphansRepaired: 0, stale: true };
    }
    const result = await runSubscriptionReconciliationLocked(providerSnapshot, options);
    if (options.capturePostState) result.postStateFingerprint = await options.capturePostState();
    return result;
  });
  if (!locked.locked) throw new Error("Another subscription reconciliation is already running");
  return locked.result;
}

async function runSubscriptionReconciliationLocked(
  providerSnapshot: SubscriptionProviderSnapshot | undefined,
  options: { triggeredBy?: string },
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    scanned: 0,
    updated: 0,
    revoked: 0,
    errors: 0,
    staleCleanedUp: 0,
    orphansRepaired: 0,
  };

  // ─── Part 1: Reconcile active subscriptions (batched) ───
  const BATCH_SIZE = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const activeOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.status, ["completed", "canceled"]),
          isNotNull(orders.subscriptionId),
        ),
      )
      .limit(BATCH_SIZE)
      .offset(offset);

    if (activeOrders.length < BATCH_SIZE) hasMore = false;
    offset += activeOrders.length;

    for (const order of activeOrders) {
      await reconcileOneOrder(order, result, providerSnapshot?.bySubscriptionId[order.subscriptionId!], options.triggeredBy);
      // Rate limit: 120 reads/min for Portaly, pace at ~1 per second
      if (!providerSnapshot) await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ─── Part 2: Clean up stale pending orders without a provider session ───
  // Known checkouts require provider evidence; age alone cannot expire them.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        isNull(orders.portalySessionId),
        lt(orders.createdAt, twentyFourHoursAgo),
      ),
    );

  for (const stale of staleOrders) {
    const [expired] = await db
      .update(orders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(
        eq(orders.id, stale.id),
        eq(orders.status, "pending"),
        isNull(orders.portalySessionId),
        lt(orders.createdAt, twentyFourHoursAgo),
      ))
      .returning({ id: orders.id });
    if (expired) result.staleCleanedUp++;
  }

  // ─── Part 3: Orphan order repair ───
  // Completed orders that are missing a userPurchase record (e.g., ensureUserPurchase
  // failed after order completion and rollback also failed due to race).
  const completedOrders = await db
    .select({ id: orders.id, userId: orders.userId, planId: orders.planId })
    .from(orders)
    .where(eq(orders.status, "completed"));

  for (const co of completedOrders) {
    const purchase = await db.query.userPurchases.findFirst({
      where: and(
        eq(userPurchases.userId, co.userId),
        eq(userPurchases.planId, co.planId),
        eq(userPurchases.orderId, co.id),
      ),
    });
    if (!purchase) {
      logger.warn("Orphan repair: order missing userPurchase, rebuilding", { orderId: co.id });
      try {
        await ensureUserPurchase(co.userId, co.planId, co.id, {
          triggeredBy: options.triggeredBy ?? "reconcile.orphan-repair",
        });
        result.orphansRepaired++;
      } catch (err) {
        result.errors++;
        logger.error("Orphan repair failed", { orderId: co.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  logger.info("Reconciliation complete", {
    scanned: result.scanned,
    updated: result.updated,
    revoked: result.revoked,
    errors: result.errors,
    staleCleanedUp: result.staleCleanedUp,
    orphansRepaired: result.orphansRepaired,
  });

  return result;
}

// ─── Single-order reconciliation ───

async function reconcileOneOrder(
  order: Order,
  result: ReconciliationResult,
  providerResult?: { data?: Record<string, unknown>; error?: string },
  triggeredBy = "reconcile.subscription-status",
): Promise<void> {
  result.scanned++;

  if (!order.subscriptionId) return;

  try {
    const { data: sub, error } = providerResult ?? await getSubscription(order.subscriptionId);

    if (error || !sub) {
      result.errors++;
      logger.error("Failed to fetch subscription", { subscriptionId: order.subscriptionId, error: String(error) });
      return;
    }

    const fields = normalizePortalySubscriptionFields(sub);
    const transition = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy,
      orderChanges: fields,
    });
    if (transition.updated) result.updated++;
    if (transition.purchasesRevoked > 0) result.revoked += transition.purchasesRevoked;
  } catch (err) {
    result.errors++;
    logger.error("Error processing order", { orderId: order.id, error: err instanceof Error ? err.message : String(err) });
  }
}
