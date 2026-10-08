import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api-route";
import { db } from "@/lib/db";
import { orders, plans, userPurchases, users } from "@/lib/db/schema";
import type { PortalyOrder, PortalySubscription } from "@/lib/portaly-types";
import { loadPortalyRebuildSnapshot, type PortalyRebuildSnapshot } from "@/lib/rebuild-orders";
import { loadSubscriptionProviderSnapshot, type SubscriptionProviderSnapshot } from "@/lib/reconcile-subscriptions";
import { normalizePortalySubscriptionFields } from "@/lib/subscription-state";
import { fingerprintProviderSyncSource, stableProviderSyncId } from "@/lib/provider-sync-utils";

export type ProviderSyncChange = {
  entityType: "order" | "subscription" | "user" | "entitlement";
  entityId: string;
  action: "create" | "update" | "revoke" | "skip" | "unchanged";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason?: string;
};

export type ProviderSyncAnalysis = {
  operation: "orders" | "subscriptions";
  sourceFingerprint: string;
  fingerprint: string;
  counts: Record<string, number>;
  changes: ProviderSyncChange[];
  externalCalls: number;
  warnings: string[];
  providerSnapshot: PortalyRebuildSnapshot | SubscriptionProviderSnapshot;
};

function operationFingerprint(input: Omit<ProviderSyncAnalysis, "fingerprint" | "providerSnapshot">): string {
  return fingerprintProviderSyncSource({
    operation: input.operation,
    sourceFingerprint: input.sourceFingerprint,
    counts: input.counts,
    changes: input.changes,
    externalCalls: input.externalCalls,
    warnings: input.warnings,
  });
}

function providerPlanIndex(localPlans: typeof plans.$inferSelect[]): Map<string, typeof plans.$inferSelect> {
  const index = new Map<string, typeof plans.$inferSelect>();
  const seen = new Set<string>();
  for (const plan of localPlans) {
    for (const providerId of new Set([plan.providerPlanId, plan.id].filter((id): id is string => Boolean(id)))) {
      const previous = index.get(providerId);
      if (previous && previous.id !== plan.id) seen.add(providerId);
      else index.set(providerId, plan);
    }
  }
  if (seen.size > 0) {
    throw new ApiError({
      code: "AMBIGUOUS_PROVIDER_PLAN_MAPPING",
      message: "Multiple local plans match the same Portaly plan ID; resolve mappings before syncing",
      status: 409,
      details: { ambiguousCount: seen.size },
    });
  }
  return index;
}

function normalizeEmail(email: string | null | undefined): string | null {
  return email?.toLowerCase().trim() || null;
}

function orderProjection(order: typeof orders.$inferSelect) {
  return {
    id: order.id,
    userId: order.userId,
    planId: order.planId,
    merchantOrderNumber: order.merchantOrderNumber,
    providerPlanId: order.providerPlanId,
    providerMode: order.providerMode,
    subscriptionId: order.subscriptionId,
    status: order.status,
    paidAmount: order.paidAmount,
    currency: order.currency,
    expectedAmount: order.expectedAmount,
    expectedCurrency: order.expectedCurrency,
    paymentMethod: order.paymentMethod,
  };
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return Object.keys(after).some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function analyzePortalyOrderRebuild(
  providerSnapshot?: PortalyRebuildSnapshot,
): Promise<ProviderSyncAnalysis> {
  const snapshot = providerSnapshot ?? await loadPortalyRebuildSnapshot();
  const [localPlans, localUsers, localOrders, localPurchases] = await Promise.all([
    db.select().from(plans),
    db.select().from(users),
    db.select().from(orders),
    db.select().from(userPurchases),
  ]);
  const plansByProviderId = providerPlanIndex(localPlans);
  const usersByEmail = new Map<string, typeof localUsers[number]>();
  for (const user of localUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    if (email !== user.email) {
      throw new ApiError({ code: "UNNORMALIZED_LOCAL_EMAIL", message: "Local customer emails must be normalized before rebuilding orders", status: 409 });
    }
    if (usersByEmail.has(email)) {
      throw new ApiError({ code: "AMBIGUOUS_LOCAL_EMAIL", message: "Multiple local users match a Portaly customer email; resolve before rebuilding", status: 409 });
    }
    usersByEmail.set(email, user);
  }
  const ordersByMerchantNumber = new Map(localOrders.map((order) => [order.merchantOrderNumber, order]));
  const purchasesByOrder = new Set(localPurchases.filter((purchase) => purchase.orderId).map((purchase) => purchase.orderId!));
  const orderCandidates = [...localOrders];
  const changes: ProviderSyncChange[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {
    providerOrdersScanned: snapshot.orders.length,
    ordersCreated: 0,
    ordersUpdated: 0,
    purchasesCreated: 0,
    subscriptionsUpdated: 0,
    subscriptionsRevoked: 0,
    usersCreated: 0,
    skipped: 0,
    unchanged: 0,
  };
  const seenMerchantNumbers = new Set<string>();
  const analyzedAt = new Date();

  for (const po of [...snapshot.orders].sort((a, b) => a.id.localeCompare(b.id))) {
    const merchantOrderNumber = po.merchantOrderNumber || `rebuilt-${po.id}`;
    if (seenMerchantNumbers.has(merchantOrderNumber)) {
      throw new ApiError({ code: "DUPLICATE_PROVIDER_ORDER", message: "Portaly returned duplicate merchant order numbers; resolve before rebuilding", status: 502 });
    }
    seenMerchantNumbers.add(merchantOrderNumber);
    if (po.status !== "paid" && po.status !== "completed") continue;
    const providerPlanId = po.creatorSubscriptionPlanId;
    const localPlan = providerPlanId ? plansByProviderId.get(providerPlanId) : null;
    const email = normalizeEmail(po.email);
    if (!providerPlanId || !localPlan || !email) {
      counts.skipped = (counts.skipped ?? 0) + 1;
      changes.push({
        entityType: "order",
        entityId: po.id,
        action: "skip",
        before: null,
        after: null,
        reason: !email ? "missing-customer-email" : !localPlan ? "unmapped-plan" : "missing-plan-id",
      });
      warnings.push(`Provider order ${po.id} cannot be mapped and will be skipped.`);
      continue;
    }

    let user = usersByEmail.get(email);
    const userCreated = !user;
    if (!user) {
      user = {
        id: stableProviderSyncId("user", email),
        email,
        name: po.name || null,
        role: "member",
      } as typeof users.$inferSelect;
      usersByEmail.set(email, user);
      counts.usersCreated = (counts.usersCreated ?? 0) + 1;
      changes.push({
        entityType: "user",
        entityId: createHash("sha256").update(email).digest("hex").slice(0, 16),
        action: "create",
        before: null,
        after: { role: "member", hasName: Boolean(po.name) },
      });
    }

    const existing = ordersByMerchantNumber.get(merchantOrderNumber);
    const orderId = existing?.id ?? stableProviderSyncId("order", merchantOrderNumber);
    const before = existing ? orderProjection(existing) : null;
    const after = existing
      ? {
          id: orderId,
          userId: existing.userId,
          planId: existing.planId,
          merchantOrderNumber,
          providerPlanId: existing.providerPlanId ?? providerPlanId,
          providerMode: existing.providerMode ?? snapshot.providerMode,
          subscriptionId: existing.subscriptionId ?? po.creatorSubscriptionId ?? null,
          status: existing.status,
          paidAmount: po.amount,
          currency: existing.currency,
          expectedAmount: existing.expectedAmount,
          expectedCurrency: existing.expectedCurrency,
          paymentMethod: po.paymentMethod || existing.paymentMethod,
        }
      : {
          id: orderId,
          userId: user.id,
          planId: localPlan.id,
          merchantOrderNumber,
          providerPlanId,
          providerMode: snapshot.providerMode,
          subscriptionId: po.creatorSubscriptionId || null,
          status: "completed",
          paidAmount: po.amount,
          currency: po.currency,
          expectedAmount: po.amount,
          expectedCurrency: po.currency,
          paymentMethod: po.paymentMethod || null,
        };
    const action = existing ? (diff(before!, after) ? "update" : "unchanged") : "create";
    if (action === "create") counts.ordersCreated = (counts.ordersCreated ?? 0) + 1;
    else if (action === "update") counts.ordersUpdated = (counts.ordersUpdated ?? 0) + 1;
    else counts.unchanged = (counts.unchanged ?? 0) + 1;
    changes.push({ entityType: "order", entityId: po.id, action, before, after });

    const hasPurchase = existing ? purchasesByOrder.has(existing.id) : false;
    if (!hasPurchase) {
      counts.purchasesCreated = (counts.purchasesCreated ?? 0) + 1;
      changes.push({
        entityType: "entitlement",
        entityId: orderId,
        action: "create",
        before: null,
        after: { source: po.creatorSubscriptionId ? "subscription" : "payment" },
      });
    }
    if (!existing) {
      const syntheticOrder = {
        id: orderId,
        userId: user.id,
        planId: localPlan.id,
        merchantOrderNumber,
        providerPlanId,
        providerMode: snapshot.providerMode,
        subscriptionId: po.creatorSubscriptionId || null,
        status: "completed",
        paidAmount: po.amount,
        currency: po.currency,
        expectedAmount: po.amount,
        expectedCurrency: po.currency,
        paymentMethod: po.paymentMethod || null,
        createdAt: new Date(po.createdAt),
        updatedAt: new Date(po.createdAt),
      } as typeof orders.$inferSelect;
      orderCandidates.push(syntheticOrder);
      ordersByMerchantNumber.set(merchantOrderNumber, syntheticOrder);
      if (userCreated) usersByEmail.set(email, user);
    }
  }

  for (const sub of [...snapshot.subscriptions].sort((a, b) => a.id.localeCompare(b.id))) {
    const email = normalizeEmail(sub.customerEmail);
    if (!email) continue;
    const user = usersByEmail.get(email);
    const localPlan = plansByProviderId.get(sub.planId);
    if (!user || !localPlan) continue;
    const linked = orderCandidates.find((order) => order.userId === user.id && order.subscriptionId === sub.id);
    const target = linked ?? orderCandidates
      .filter((order) => order.userId === user.id && order.planId === localPlan.id && order.status === "completed" && !order.subscriptionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!target) continue;

    const normalized = normalizePortalySubscriptionFields(sub);
    const before = {
      subscriptionId: target.subscriptionId,
      subscriptionStatus: target.subscriptionStatus,
      cancelAtPeriodEnd: target.cancelAtPeriodEnd,
      cancelEffectiveAt: target.cancelEffectiveAt?.toISOString() ?? null,
      nextBillingAt: target.nextBillingAt?.toISOString() ?? null,
      status: target.status,
    };
    const afterStatus = normalized.subscriptionStatus === "active"
      && target.status === "canceled"
      && !target.refundedAt
      ? "completed"
      : target.status;
    const after = {
      subscriptionId: sub.id,
      subscriptionStatus: normalized.subscriptionStatus,
      cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
      cancelEffectiveAt: normalized.cancelEffectiveAt?.toISOString() ?? null,
      nextBillingAt: normalized.nextBillingAt?.toISOString() ?? null,
      status: afterStatus,
    };
    const changed = diff(before, after);
    if (changed) counts.subscriptionsUpdated = (counts.subscriptionsUpdated ?? 0) + 1;
    changes.push({ entityType: "subscription", entityId: target.id, action: changed ? "update" : "unchanged", before, after });
    const paidThrough = normalized.cancelEffectiveAt ?? normalized.nextBillingAt;
    const terminal = normalized.subscriptionStatus === "expired"
      || ((normalized.subscriptionStatus === "canceled" || normalized.cancelAtPeriodEnd)
        && (!paidThrough || paidThrough <= analyzedAt));
    const orderPurchases = localPurchases.filter((purchase) => purchase.orderId === target.id);
    const activePurchases = orderPurchases.filter((purchase) => !purchase.revokedAt);
    if (terminal && activePurchases.length > 0) {
      counts.subscriptionsRevoked = (counts.subscriptionsRevoked ?? 0) + activePurchases.length;
      changes.push({
        entityType: "entitlement",
        entityId: target.id,
        action: "revoke",
        before: { activePurchases: activePurchases.length },
        after: { activePurchases: 0 },
        reason: "provider-subscription-terminal",
      });
    } else if (
      normalized.subscriptionStatus === "active"
      && (target.status === "canceled" || target.status === "completed")
      && !target.refundedAt
      && activePurchases.length === 0
    ) {
      const recoverable = orderPurchases.filter((purchase) => (
        purchase.revokedAt
        && Boolean(purchase.revokedBy)
        && ["reconcile.", "rebuild-orders.", "subscription.", "provider-sync:"].some((prefix) => purchase.revokedBy!.startsWith(prefix))
      ));
      if (recoverable.length > 0) {
        changes.push({
          entityType: "entitlement",
          entityId: target.id,
          action: "create",
          before: { revokedPurchases: recoverable.length },
          after: { activePurchases: recoverable.length },
          reason: "provider-subscription-recovered",
        });
      }
    }
    target.subscriptionId = sub.id;
    target.subscriptionStatus = normalized.subscriptionStatus;
    target.cancelAtPeriodEnd = normalized.cancelAtPeriodEnd;
    target.cancelEffectiveAt = normalized.cancelEffectiveAt;
    target.nextBillingAt = normalized.nextBillingAt;
    target.status = afterStatus;
  }

  const sourceFingerprint = fingerprintProviderSyncSource({
    provider: {
      providerMode: snapshot.providerMode,
      orders: [...snapshot.orders].sort((a, b) => a.id.localeCompare(b.id)),
      subscriptions: [...snapshot.subscriptions].sort((a, b) => a.id.localeCompare(b.id)),
    },
    local: {
      plans: [...localPlans].sort((a, b) => a.id.localeCompare(b.id)),
      users: [...localUsers].sort((a, b) => a.id.localeCompare(b.id)),
      orders: [...localOrders].sort((a, b) => a.id.localeCompare(b.id)),
      purchases: [...localPurchases].sort((a, b) => a.id.localeCompare(b.id)),
    },
  });
  const base = {
    operation: "orders" as const,
    sourceFingerprint,
    counts,
    changes,
    externalCalls: snapshot.externalCalls,
    warnings: [...new Set(warnings)].slice(0, 50),
  };
  return { ...base, fingerprint: operationFingerprint(base), providerSnapshot: snapshot };
}

export async function analyzeSubscriptionReconciliation(
  providerSnapshot?: SubscriptionProviderSnapshot,
): Promise<ProviderSyncAnalysis> {
  const snapshot = providerSnapshot ?? await loadSubscriptionProviderSnapshot();
  const [allOrders, allPurchases] = await Promise.all([
    db.select().from(orders),
    db.select().from(userPurchases),
  ]);
  const now = new Date();
  const activeOrders = allOrders.filter((order) =>
    (order.status === "completed" || order.status === "canceled") && Boolean(order.subscriptionId),
  ).sort((a, b) => a.id.localeCompare(b.id));
  const staleOrders = allOrders.filter((order) =>
    order.status === "pending" && order.createdAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000,
  ).sort((a, b) => a.id.localeCompare(b.id));
  const completedOrders = allOrders.filter((order) => order.status === "completed").sort((a, b) => a.id.localeCompare(b.id));
  const purchasesByOrder = new Map<string, typeof allPurchases>();
  for (const purchase of allPurchases) {
    if (!purchase.orderId) continue;
    const rows = purchasesByOrder.get(purchase.orderId) ?? [];
    rows.push(purchase);
    purchasesByOrder.set(purchase.orderId, rows);
  }
  const changes: ProviderSyncChange[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {
    scanned: activeOrders.length,
    updated: 0,
    revoked: 0,
    errors: 0,
    staleCleanedUp: staleOrders.length,
    orphansRepaired: 0,
    unchanged: 0,
  };

  for (const order of activeOrders) {
    const subscriptionId = order.subscriptionId!;
    const providerResult = snapshot.bySubscriptionId[subscriptionId];
    if (providerResult?.error || !providerResult?.data) {
      counts.errors = (counts.errors ?? 0) + 1;
      warnings.push(`Subscription ${subscriptionId} could not be refreshed; this order will be skipped.`);
      changes.push({ entityType: "subscription", entityId: order.id, action: "skip", before: null, after: null, reason: "provider-read-failed" });
      continue;
    }
    const fields = normalizePortalySubscriptionFields(providerResult.data);
    const before = {
      status: order.status,
      subscriptionId: order.subscriptionId,
      subscriptionStatus: order.subscriptionStatus,
      cancelAtPeriodEnd: order.cancelAtPeriodEnd,
      cancelEffectiveAt: order.cancelEffectiveAt?.toISOString() ?? null,
      nextBillingAt: order.nextBillingAt?.toISOString() ?? null,
    };
    const afterStatus = fields.subscriptionStatus === "active" && order.status === "canceled" && !order.refundedAt
      ? "completed"
      : order.status;
    const after = {
      status: order.status === "refunded" || order.refundedAt ? order.status : afterStatus,
      subscriptionId,
      subscriptionStatus: fields.subscriptionStatus,
      cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
      cancelEffectiveAt: fields.cancelEffectiveAt?.toISOString() ?? null,
      nextBillingAt: fields.nextBillingAt?.toISOString() ?? null,
    };
    const changed = diff(before, after);
    if (changed) counts.updated = (counts.updated ?? 0) + 1;
    else counts.unchanged = (counts.unchanged ?? 0) + 1;
    changes.push({ entityType: "subscription", entityId: order.id, action: changed ? "update" : "unchanged", before, after });

    const paidThrough = fields.cancelEffectiveAt ?? fields.nextBillingAt;
    const terminal = fields.subscriptionStatus === "expired"
      || ((fields.subscriptionStatus === "canceled" || fields.cancelAtPeriodEnd)
        && (!paidThrough || paidThrough <= now));
    const activePurchases = (purchasesByOrder.get(order.id) ?? []).filter((purchase) => !purchase.revokedAt);
    if (terminal && activePurchases.length > 0) {
      counts.revoked = (counts.revoked ?? 0) + activePurchases.length;
      changes.push({
        entityType: "entitlement",
        entityId: order.id,
        action: "revoke",
        before: { activePurchases: activePurchases.length },
        after: { activePurchases: 0 },
        reason: "provider-subscription-terminal",
      });
    }
  }

  for (const order of staleOrders) {
    changes.push({
      entityType: "order",
      entityId: order.id,
      action: "update",
      before: { status: "pending" },
      after: { status: "expired" },
      reason: "pending-order-older-than-24-hours",
    });
  }
  for (const order of completedOrders) {
    if ((purchasesByOrder.get(order.id) ?? []).some((purchase) => purchase.userId === order.userId && purchase.planId === order.planId)) continue;
    counts.orphansRepaired = (counts.orphansRepaired ?? 0) + 1;
    changes.push({
      entityType: "entitlement",
      entityId: order.id,
      action: "create",
      before: null,
      after: { userId: order.userId, planId: order.planId },
      reason: "completed-order-missing-purchase",
    });
  }

  const sourceFingerprint = fingerprintProviderSyncSource({
    provider: {
      externalCalls: snapshot.externalCalls,
      bySubscriptionId: Object.fromEntries(Object.entries(snapshot.bySubscriptionId).sort(([left], [right]) => left.localeCompare(right))),
    },
    local: {
      orders: [...allOrders].sort((a, b) => a.id.localeCompare(b.id)),
      purchases: [...allPurchases].sort((a, b) => a.id.localeCompare(b.id)),
    },
  });
  const base = {
    operation: "subscriptions" as const,
    sourceFingerprint,
    counts,
    changes,
    externalCalls: snapshot.externalCalls,
    warnings: [...new Set(warnings)].slice(0, 50),
  };
  return { ...base, fingerprint: operationFingerprint(base), providerSnapshot: snapshot };
}

export async function prepareOrdersSync(): Promise<ProviderSyncAnalysis> {
  return analyzePortalyOrderRebuild(await loadPortalyRebuildSnapshot());
}

export async function prepareSubscriptionSync(): Promise<ProviderSyncAnalysis> {
  return analyzeSubscriptionReconciliation(await loadSubscriptionProviderSnapshot());
}

export type { PortalyOrder, PortalySubscription };
