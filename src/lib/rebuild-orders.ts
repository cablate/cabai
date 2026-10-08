/**
 * Rebuild local orders from Portaly.
 *
 * When local order data is lost or out of sync, this pulls all orders
 * from Portaly and rebuilds: orders, userPurchases, subscription status.
 *
 * Source of truth:
 * - Payment status → Portaly (they collected the money)
 * - Subscription status → Portaly (they manage the lifecycle)
 * - userId (who bought it) → Us (we map email → user)
 * - userPurchase (entitlement) → Us, based on Portaly's payment status
 */

import { db } from "@/lib/db";
import { orders, plans, users } from "@/lib/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { listOrders, listSubscriptions } from "@/lib/portaly";
import type { PortalyOrder, PortalySubscription } from "@/lib/portaly-types";
import { inspectPortalyConfig } from "@/lib/config/portaly";
import { createLogger } from "@/lib/logger";
import {
  ensurePaymentPurchaseInTransaction,
  reconcileOrderSubscriptionState,
} from "@/lib/entitlement-transitions";
import { normalizePortalySubscriptionFields } from "@/lib/subscription-state";
import { stableProviderSyncId } from "@/lib/provider-sync-utils";
import { withCronLock } from "@/lib/cron-lock";

const logger = createLogger("rebuild-orders");

export interface RebuildResult {
  portalyOrdersScanned: number;
  ordersCreated: number;
  ordersUpdated: number;
  purchasesCreated: number;
  subscriptionsUpdated: number;
  subscriptionsRevoked: number;
  usersCreated: number;
  errors: string[];
  stale?: boolean;
  postStateFingerprint?: string;
}

export interface PortalyRebuildSnapshot {
  providerMode: "test" | "live" | null;
  orders: PortalyOrder[];
  subscriptions: PortalySubscription[];
  externalCalls: number;
}

/**
 * Collect a complete provider snapshot for preview/execute. Unlike the legacy
 * rebuild path, an incomplete page sequence is rejected so a partial preview
 * can never be mistaken for a complete change set.
 */
export async function loadPortalyRebuildSnapshot(): Promise<PortalyRebuildSnapshot> {
  const collectPages = async <T extends { id: string }>(
    kind: string,
    fetchPage: (cursor?: string) => Promise<{ data?: T[]; error?: string }>,
  ) => {
    const result: T[] = [];
    let cursor: string | undefined;
    let externalCalls = 0;
    while (true) {
      const response = await fetchPage(cursor);
      externalCalls++;
      if (response.error || !response.data) {
        throw new Error(`Portaly ${kind} snapshot failed: ${response.error ?? "no data"}`);
      }
      result.push(...response.data);
      if (response.data.length < 100) break;
      cursor = response.data[response.data.length - 1]!.id;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { data: result, externalCalls };
  };
  const orderSnapshot = await collectPages("orders", (cursor) => listOrders({ limit: 100, startAfter: cursor }));
  const subscriptionSnapshot = await collectPages("subscriptions", (cursor) => listSubscriptions({ limit: 100, startAfter: cursor }));

  return {
    providerMode: inspectPortalyConfig().mode ?? null,
    orders: orderSnapshot.data,
    subscriptions: subscriptionSnapshot.data,
    externalCalls: orderSnapshot.externalCalls + subscriptionSnapshot.externalCalls,
  };
}

export async function rebuildOrdersFromPortaly(
  providerSnapshot?: PortalyRebuildSnapshot,
  options: { triggeredBy?: string; ensureFresh?: () => Promise<boolean>; capturePostState?: () => Promise<string> } = {},
): Promise<RebuildResult> {
  const locked = await withCronLock("provider-sync:orders:mutation", async () => {
    const result = await rebuildOrdersFromPortalyLocked(providerSnapshot, options);
    if (!result.stale && options.capturePostState) result.postStateFingerprint = await options.capturePostState();
    return result;
  });
  if (!locked.locked) throw new Error("Another provider order rebuild is already running");
  return locked.result;
}

async function rebuildOrdersFromPortalyLocked(
  providerSnapshot: PortalyRebuildSnapshot | undefined,
  options: { triggeredBy?: string; ensureFresh?: () => Promise<boolean>; capturePostState?: () => Promise<string> },
): Promise<RebuildResult> {
  const providerMode = providerSnapshot?.providerMode ?? inspectPortalyConfig().mode ?? null;
  const result: RebuildResult = {
    portalyOrdersScanned: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    purchasesCreated: 0,
    subscriptionsUpdated: 0,
    subscriptionsRevoked: 0,
    usersCreated: 0,
    errors: [],
  };
  if (options.ensureFresh && !(await options.ensureFresh())) return { ...result, stale: true };

  // ─── Step 1: Pull all Portaly orders (paginated) ───
  const allPortalyOrders: PortalyOrder[] = providerSnapshot?.orders ?? [];
  let cursor: string | undefined;
  let hasMore = !providerSnapshot;

  while (hasMore) {
    const res = await listOrders({ limit: 100, startAfter: cursor });
    if (res.error || !res.data) {
      result.errors.push(`listOrders failed: ${res.error ?? "no data"}`);
      break;
    }
    allPortalyOrders.push(...res.data);
    // Portaly pagination: if we got less than limit, no more
    hasMore = res.data.length === 100;
    if (hasMore && res.data.length > 0) {
      cursor = res.data[res.data.length - 1]!.id;
    }

    // Rate limit: ~2 req/sec
    await new Promise((r) => setTimeout(r, 500));
  }

  result.portalyOrdersScanned = allPortalyOrders.length;
  logger.info("Pulled Portaly orders", { count: allPortalyOrders.length });

  // ─── Step 2: Process each order ───
  for (const po of allPortalyOrders) {
    try {
      await processOnePortalyOrder(po, result, providerMode, options.triggeredBy);
    } catch (err) {
      const msg = `Order ${po.id}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      logger.error("Failed to process Portaly order", { portalyOrderId: po.id, error: msg });
    }
  }

  // ─── Step 3: Sync subscription status ───
  try {
    const subResult = await syncSubscriptionStatuses(providerSnapshot?.subscriptions, options.triggeredBy);
    result.subscriptionsUpdated = subResult.updated;
    result.subscriptionsRevoked = subResult.revoked;
  } catch (err) {
    result.errors.push(`Subscription sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  logger.info("Rebuild complete", result as unknown as Record<string, unknown>);
  return result;
}

async function processOnePortalyOrder(
  po: PortalyOrder,
  result: RebuildResult,
  providerMode: "test" | "live" | null,
      triggeredBy = "rebuild-orders",
): Promise<void> {
  // Skip non-completed orders
  if (po.status !== "paid" && po.status !== "completed") return;

  const providerPlanId = po.creatorSubscriptionPlanId;
  if (!providerPlanId) return; // Can't link to a plan
  const localPlan = await db.query.plans.findFirst({
    where: or(eq(plans.providerPlanId, providerPlanId), eq(plans.id, providerPlanId)),
    columns: { id: true },
  });
  if (!localPlan) return;
  const planId = localPlan.id;

  // Find or create user by email
  const email = po.email?.toLowerCase().trim();
  if (!email) return;

  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });

  if (!user) {
    const [created] = await db.insert(users).values({
      id: stableProviderSyncId("user", email),
      email,
      name: po.name || null,
      role: "member",
    }).onConflictDoNothing().returning({ id: users.id });

    if (created) {
      user = created;
      result.usersCreated++;
    } else {
      user = await db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true },
      });
    }
  }
  if (!user) return;

  const merchantOrderNumber = po.merchantOrderNumber || `rebuilt-${po.id}`;
  const persisted = await db.transaction(async (tx) => {
    let localOrder = await tx.query.orders.findFirst({
      where: eq(orders.merchantOrderNumber, merchantOrderNumber),
    });
    let orderCreated = false;

    if (!localOrder) {
      const [created] = await tx.insert(orders).values({
        id: stableProviderSyncId("order", merchantOrderNumber),
        userId: user.id,
        planId,
        providerPlanId,
        providerMode,
        merchantOrderNumber,
        subscriptionId: po.creatorSubscriptionId || null,
        status: "completed",
        paidAmount: po.amount,
        currency: po.currency,
        expectedAmount: po.amount,
        expectedCurrency: po.currency,
        paymentMethod: po.paymentMethod || null,
      }).onConflictDoNothing().returning();
      localOrder = created ?? await tx.query.orders.findFirst({
        where: eq(orders.merchantOrderNumber, merchantOrderNumber),
      });
      orderCreated = Boolean(created);
    } else {
      const [updated] = await tx.update(orders).set({
        providerPlanId: localOrder.providerPlanId ?? providerPlanId,
        providerMode: localOrder.providerMode ?? providerMode,
        paidAmount: po.amount,
        paymentMethod: po.paymentMethod || localOrder.paymentMethod,
        updatedAt: new Date(),
      }).where(eq(orders.id, localOrder.id)).returning();
      localOrder = updated;
    }
    if (!localOrder) throw new Error("Unable to persist rebuilt order.");

    const purchase = await ensurePaymentPurchaseInTransaction(tx, {
      userId: user.id,
      planId,
      orderId: localOrder.id,
      source: po.creatorSubscriptionId ? "subscription" : "payment",
      triggeredBy,
      grantedAt: po.paidAt ? new Date(po.paidAt) : undefined,
    });
    return { orderCreated, purchaseCreated: purchase.created };
  });

  if (persisted.orderCreated) result.ordersCreated++;
  else result.ordersUpdated++;
  if (persisted.purchaseCreated) result.purchasesCreated++;
}

async function syncSubscriptionStatuses(
  providerSnapshot?: PortalySubscription[],
  triggeredBy = "rebuild-orders.subscription-status",
): Promise<{ updated: number; revoked: number }> {
  let updated = 0;
  let revoked = 0;
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const res = providerSnapshot === undefined
      ? await listSubscriptions({ limit: 100, startAfter: cursor })
      : { data: providerSnapshot };
    if (res.error || !res.data) break;

    for (const sub of res.data) {
      if (!sub.customerEmail) continue;
      const email = sub.customerEmail.toLowerCase().trim();

      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true },
      });
      if (!user) continue;

      const localPlan = await db.query.plans.findFirst({
        where: or(eq(plans.providerPlanId, sub.planId), eq(plans.id, sub.planId)),
        columns: { id: true },
      });
      if (!localPlan) continue;

      const subFields = {
        subscriptionId: sub.id,
        ...normalizePortalySubscriptionFields(sub),
        updatedAt: new Date(),
      };

      // M-2: prefer the order that ALREADY carries this subscriptionId.
      // Matching only on (userId, planId, completed) — as before — could write
      // this subscription's status onto a *different* order when the same user
      // holds multiple subscriptions for the same plan (e.g. cancel + resubscribe).
      const linkedOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.userId, user.id),
          eq(orders.subscriptionId, sub.id),
        ),
        columns: { id: true },
      });

      // Fallback only claims an order NOT yet bound to any subscription, so we
      // never clobber an order already correctly linked to a sibling subscription.
      const target =
        linkedOrder ??
        (await db.query.orders.findFirst({
          where: and(
            eq(orders.userId, user.id),
            eq(orders.planId, localPlan.id),
            eq(orders.status, "completed"),
            isNull(orders.subscriptionId),
          ),
          orderBy: (o, { asc }) => asc(o.createdAt),
          columns: { id: true },
        }));

      if (target) {
        const transition = await reconcileOrderSubscriptionState({
          orderId: target.id,
          triggeredBy,
          orderChanges: subFields,
        });
        if (transition.updated) updated++;
        revoked += transition.purchasesRevoked;
      } else {
        // No order bears this subscriptionId and there is no unlinked completed
        // order to claim. Refuse to overwrite an unrelated order — surface for
        // manual backfill instead of silently corrupting a sibling's mirror.
        logger.warn("syncSubscriptionStatuses: no mappable order for subscription", {
          subscriptionId: sub.id,
          planId: sub.planId,
          userId: user.id,
        });
      }
    }

    hasMore = providerSnapshot === undefined && res.data.length === 100;
    if (providerSnapshot === undefined && hasMore && res.data.length > 0) {
      cursor = res.data[res.data.length - 1]!.id;
    }
    if (providerSnapshot === undefined) await new Promise((r) => setTimeout(r, 500));
  }

  return { updated, revoked };
}
