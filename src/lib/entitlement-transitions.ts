import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ensureRequiredAuditLogInTransaction,
  writeRequiredAuditLogInTransaction,
} from "@/lib/audit";
import type { AuditLogParams } from "@/lib/audit";
import {
  entitlementOutbox,
  orders,
  userPurchases,
} from "@/lib/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PurchaseGrantSource = "payment" | "subscription" | "marketplace";
type StandaloneGrantSource = "manual" | "free_claim";
type TransitionSource = PurchaseGrantSource | StandaloneGrantSource;

export interface QueueEntitlementTransitionInput {
  eventType: "entitlement.granted" | "entitlement.revoked";
  userId: string;
  planId: string;
  orderId?: string | null;
  purchaseId?: string | null;
  source: TransitionSource;
  triggeredBy: string;
  occurredAt?: Date;
}

function transitionKey(input: QueueEntitlementTransitionInput): string {
  const subject = input.purchaseId
    ? `purchase:${input.purchaseId}`
    : input.orderId
      ? `order:${input.orderId}`
      : `user-plan:${input.userId}:${input.planId}`;
  return `${input.eventType}:${subject}`;
}

export async function queueEntitlementTransition(
  tx: DbTransaction,
  input: QueueEntitlementTransitionInput,
): Promise<void> {
  await tx.insert(entitlementOutbox).values({
    eventType: input.eventType,
    userId: input.userId,
    planId: input.planId,
    orderId: input.orderId ?? null,
    purchaseId: input.purchaseId ?? null,
    source: input.source,
    triggeredBy: input.triggeredBy,
    idempotencyKey: transitionKey(input),
    occurredAt: input.occurredAt ?? new Date(),
  }).onConflictDoNothing();
}

/** Queue Discord-only desired-state reconciliation for every mapped plan. */
export async function enqueueDiscordRoleSyncForUser(input: {
  userId: string;
  triggeredBy: string;
}): Promise<number> {
  const mappings = await db.query.discordRoleMappings.findMany({
    columns: { planId: true },
  });
  const planIds = [...new Set(mappings.map((mapping) => mapping.planId))];
  if (planIds.length === 0) return 0;

  const now = new Date();
  const inserted = await db
    .insert(entitlementOutbox)
    .values(planIds.map((planId) => ({
      // The webhook marker is pre-set, so these rows are strictly Discord
      // desired-state work and cannot duplicate service entitlement webhooks.
      eventType: "entitlement.granted" as const,
      userId: input.userId,
      planId,
      source: "manual" as const,
      triggeredBy: input.triggeredBy,
      idempotencyKey: `discord-sync:${input.triggeredBy}:${input.userId}:${planId}`,
      occurredAt: now,
      webhookEnqueuedAt: now,
    })))
    .onConflictDoNothing()
    .returning({ id: entitlementOutbox.id });
  return inserted.length;
}

export async function ensurePaymentPurchaseInTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    planId: string;
    orderId: string;
    source: PurchaseGrantSource;
    triggeredBy: string;
    grantedAt?: Date;
  },
): Promise<{ id: string; created: boolean }> {
  const [created] = await tx
    .insert(userPurchases)
    .values({
      userId: input.userId,
      planId: input.planId,
      orderId: input.orderId,
      grantedBy: "payment",
      expiresAt: null,
      ...(input.grantedAt ? { grantedAt: input.grantedAt } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: userPurchases.id });

  const purchase = created ?? await tx.query.userPurchases.findFirst({
    where: and(
      eq(userPurchases.userId, input.userId),
      eq(userPurchases.planId, input.planId),
      eq(userPurchases.orderId, input.orderId),
    ),
    columns: { id: true },
  });
  if (!purchase) throw new Error("Unable to persist payment entitlement.");

  await queueEntitlementTransition(tx, {
    eventType: "entitlement.granted",
    userId: input.userId,
    planId: input.planId,
    orderId: input.orderId,
    purchaseId: purchase.id,
    source: input.source,
    triggeredBy: input.triggeredBy,
    occurredAt: input.grantedAt,
  });

  return { id: purchase.id, created: Boolean(created) };
}

export async function grantStandaloneEntitlement(input: {
  purchaseId?: string;
  userId: string;
  planId: string;
  grantedBy: StandaloneGrantSource;
  triggeredBy: string;
  expiresAt?: Date | null;
  duplicatePolicy: "any-active" | "same-source";
  requiredAudit?: AuditLogParams;
}): Promise<{ id: string; created: boolean; grantedAt: Date; expiresAt: Date | null; auditId?: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`entitlement:${input.userId}:${input.planId}`}::text, 0))`,
    );

    const now = new Date();
    const existing = await tx.query.userPurchases.findFirst({
      where: and(
        eq(userPurchases.userId, input.userId),
        eq(userPurchases.planId, input.planId),
        isNull(userPurchases.revokedAt),
        or(isNull(userPurchases.expiresAt), gt(userPurchases.expiresAt, now)),
        ...(input.duplicatePolicy === "same-source"
          ? [eq(userPurchases.grantedBy, input.grantedBy)]
          : []),
      ),
      columns: {
        id: true,
        grantedAt: true,
        expiresAt: true,
        orderId: true,
        grantedBy: true,
      },
    });

    if (existing) {
      const requestedExpiry = input.expiresAt?.getTime() ?? null;
      const existingExpiry = existing.expiresAt?.getTime() ?? null;
      const auditId = input.requiredAudit && existing.id === input.purchaseId && requestedExpiry === existingExpiry
        ? await ensureRequiredAuditLogInTransaction(tx, input.requiredAudit)
        : undefined;
      return {
        id: existing.id,
        created: false,
        grantedAt: existing.grantedAt,
        expiresAt: existing.expiresAt,
        ...(auditId ? { auditId } : {}),
      };
    }

    const [created] = await tx.insert(userPurchases).values({
      ...(input.purchaseId ? { id: input.purchaseId } : {}),
      userId: input.userId,
      planId: input.planId,
      orderId: null,
      grantedBy: input.grantedBy,
      expiresAt: input.expiresAt ?? null,
    }).returning({
      id: userPurchases.id,
      grantedAt: userPurchases.grantedAt,
      expiresAt: userPurchases.expiresAt,
    });
    if (!created) throw new Error("Unable to persist standalone entitlement.");

    await queueEntitlementTransition(tx, {
      eventType: "entitlement.granted",
      userId: input.userId,
      planId: input.planId,
      purchaseId: created.id,
      source: input.grantedBy,
      triggeredBy: input.triggeredBy,
      occurredAt: created.grantedAt,
    });

    const auditId = input.requiredAudit
      ? await writeRequiredAuditLogInTransaction(tx, input.requiredAudit)
      : undefined;
    return { ...created, created: true, ...(auditId ? { auditId } : {}) };
  });
}

export async function revokePurchaseEntitlement(input: {
  purchaseId: string;
  userId?: string;
  revokedBy: string;
  triggeredBy: string;
  requiredAudit?: (purchase: { id: string; userId: string; planId: string }) => AuditLogParams;
  occurredAt?: Date;
}): Promise<{
  id: string;
  userId: string;
  planId: string;
  orderId: string | null;
  changed: boolean;
  auditId?: string;
} | null> {
  return db.transaction(async (tx) => {
    const now = input.occurredAt ?? new Date();
    const identity = input.userId
      ? and(eq(userPurchases.id, input.purchaseId), eq(userPurchases.userId, input.userId))
      : eq(userPurchases.id, input.purchaseId);

    const [updated] = await tx
      .update(userPurchases)
      .set({ revokedAt: now, revokedBy: input.revokedBy, expiresAt: now })
      .where(and(identity, isNull(userPurchases.revokedAt)))
      .returning({
        id: userPurchases.id,
        userId: userPurchases.userId,
        planId: userPurchases.planId,
        orderId: userPurchases.orderId,
        grantedBy: userPurchases.grantedBy,
      });

    const purchase = updated ?? await tx.query.userPurchases.findFirst({
      where: identity,
      columns: {
        id: true,
        userId: true,
        planId: true,
        orderId: true,
        grantedBy: true,
      },
    });
    if (!purchase) return null;

    await queueEntitlementTransition(tx, {
      eventType: "entitlement.revoked",
      userId: purchase.userId,
      planId: purchase.planId,
      orderId: purchase.orderId,
      purchaseId: purchase.id,
      source: purchase.grantedBy,
      triggeredBy: input.triggeredBy,
      occurredAt: now,
    });

    const auditId = updated && input.requiredAudit
      ? await writeRequiredAuditLogInTransaction(tx, input.requiredAudit(purchase))
      : undefined;

    return {
      id: purchase.id,
      userId: purchase.userId,
      planId: purchase.planId,
      orderId: purchase.orderId,
      changed: Boolean(updated),
      ...(auditId ? { auditId } : {}),
    };
  });
}

export type EntitlementOrderChanges = Partial<Pick<
  typeof orders.$inferInsert,
  | "status"
  | "subscriptionId"
  | "subscriptionStatus"
  | "cancelAtPeriodEnd"
  | "cancelEffectiveAt"
  | "nextBillingAt"
  | "refundAmount"
  | "refundedAt"
  | "refundReason"
>>;

export async function revokeOrderEntitlement(input: {
  orderId: string;
  source: "payment" | "subscription" | "marketplace";
  triggeredBy: string;
  revokedBy: string;
  orderChanges: EntitlementOrderChanges;
  occurredAt?: Date;
}): Promise<{ found: boolean; purchasesRevoked: number; transitionsEnsured: number }> {
  return db.transaction(async (tx) => {
    const now = input.occurredAt ?? new Date();
    const [order] = await tx
      .update(orders)
      .set({ ...input.orderChanges, updatedAt: now })
      .where(and(
        eq(orders.id, input.orderId),
        // Refund and cancellation callbacks may race. Keep the refund terminal
        // at the write boundary, not merely in a caller's stale read.
        input.orderChanges.status && input.orderChanges.status !== "refunded"
          ? ne(orders.status, "refunded") : undefined,
      ))
      .returning({ id: orders.id, userId: orders.userId, planId: orders.planId });
    if (!order) {
      const existing = await tx.query.orders.findFirst({
        where: eq(orders.id, input.orderId), columns: { id: true },
      });
      return { found: Boolean(existing), purchasesRevoked: 0, transitionsEnsured: 0 };
    }

    const revoked = await tx
      .update(userPurchases)
      .set({ revokedAt: now, revokedBy: input.revokedBy, expiresAt: now })
      .where(and(eq(userPurchases.orderId, order.id), isNull(userPurchases.revokedAt)))
      .returning({ id: userPurchases.id });

    const purchases = await tx.query.userPurchases.findMany({
      where: eq(userPurchases.orderId, order.id),
      columns: { id: true },
    });

    if (purchases.length === 0) {
      await queueEntitlementTransition(tx, {
        eventType: "entitlement.revoked",
        userId: order.userId,
        planId: order.planId,
        orderId: order.id,
        source: input.source,
        triggeredBy: input.triggeredBy,
        occurredAt: now,
      });
    } else {
      for (const purchase of purchases) {
        await queueEntitlementTransition(tx, {
          eventType: "entitlement.revoked",
          userId: order.userId,
          planId: order.planId,
          orderId: order.id,
          purchaseId: purchase.id,
          source: input.source,
          triggeredBy: input.triggeredBy,
          occurredAt: now,
        });
      }
    }

    return {
      found: true,
      purchasesRevoked: revoked.length,
      transitionsEnsured: Math.max(1, purchases.length),
    };
  });
}

/**
 * Persist a provider subscription snapshot and emit the matching entitlement
 * transition in the same transaction.
 *
 * Temporary provider states such as `past_due` remove external access without
 * permanently revoking the purchase, so a later `active` observation can
 * restore it. Terminal states revoke the purchase rows as well. An advisory
 * transaction lock serializes concurrent reconciliation/manual rebuild runs
 * for the same order.
 */
export async function reconcileOrderSubscriptionState(input: {
  orderId: string;
  triggeredBy: string;
  orderChanges: EntitlementOrderChanges;
  occurredAt?: Date;
}): Promise<{
  found: boolean;
  updated: boolean;
  accessChanged: boolean;
  purchasesRevoked: number;
}> {
  return db.transaction(async (tx) => {
    const now = input.occurredAt ?? new Date();
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${input.orderId}`}::text, 0))`,
    );

    const order = await tx.query.orders.findFirst({
      where: eq(orders.id, input.orderId),
    });
    if (!order) {
      return { found: false, updated: false, accessChanged: false, purchasesRevoked: 0 };
    }

    const purchases = await tx.query.userPurchases.findMany({
      where: eq(userPurchases.orderId, order.id),
      columns: { id: true, revokedAt: true, revokedBy: true },
    });
    const activePurchases = purchases.filter((purchase) => !purchase.revokedAt);
    const beforeEntitled = activePurchases.length > 0 && subscriptionStateGrantsAccess(order, now);
    const effectiveChanges: EntitlementOrderChanges = { ...input.orderChanges };
    if (order.status === "refunded" || order.refundedAt) {
      delete effectiveChanges.status;
    }
    if (
      effectiveChanges.subscriptionStatus === "active" &&
      order.status === "canceled" &&
      !order.refundedAt
    ) {
      effectiveChanges.status = "completed";
    }
    const nextOrder = { ...order, ...effectiveChanges };

    let recoveredPurchases = 0;
    if (
      activePurchases.length === 0 &&
      subscriptionStateGrantsAccess(nextOrder, now) &&
      nextOrder.status === "completed" &&
      order.status !== "refunded" &&
      !order.refundedAt
    ) {
      const recoverableIds = purchases
        .filter((purchase) => purchase.revokedAt && isRecoverableSubscriptionRevocation(
          purchase.revokedBy,
          order.status,
        ))
        .map((purchase) => purchase.id);
      if (recoverableIds.length > 0) {
        const recovered = await tx
          .update(userPurchases)
          .set({ revokedAt: null, revokedBy: null, expiresAt: null })
          .where(or(...recoverableIds.map((id) => eq(userPurchases.id, id))))
          .returning({ id: userPurchases.id });
        recoveredPurchases = recovered.length;
      }
    }

    const afterEntitled = (activePurchases.length + recoveredPurchases) > 0 &&
      subscriptionStateGrantsAccess(nextOrder, now);
    const terminal = subscriptionStateIsTerminal(nextOrder, now);
    const changed = subscriptionFieldsChanged(order, effectiveChanges);

    if (changed) {
      await tx
        .update(orders)
        .set({ ...effectiveChanges, updatedAt: now })
        .where(eq(orders.id, order.id));
    }

    let purchasesRevoked = 0;
    if (terminal && purchases.length > 0) {
      const revoked = await tx
        .update(userPurchases)
        .set({
          revokedAt: now,
          revokedBy: input.triggeredBy,
          expiresAt: now,
        })
        .where(and(eq(userPurchases.orderId, order.id), isNull(userPurchases.revokedAt)))
        .returning({ id: userPurchases.id });
      purchasesRevoked = revoked.length;
    }

    const accessChanged = beforeEntitled !== afterEntitled;
    // A terminal observation must remain repairable even when the local
    // purchase was already temporarily non-entitled (for example past_due ->
    // expired), hence the explicit terminal/revocation branch.
    const shouldQueue = accessChanged || purchasesRevoked > 0 || recoveredPurchases > 0;
    if (shouldQueue) {
      const eventType = afterEntitled
        ? "entitlement.granted" as const
        : "entitlement.revoked" as const;
      const oldVersion = order.updatedAt?.getTime() ?? order.createdAt.getTime();
      await tx.insert(entitlementOutbox).values({
        eventType,
        userId: order.userId,
        planId: order.planId,
        orderId: order.id,
        purchaseId: null,
        source: "subscription",
        triggeredBy: input.triggeredBy,
        idempotencyKey: [
          "subscription-state",
          order.id,
          oldVersion,
          eventType,
          nextOrder.subscriptionStatus ?? "none",
          nextOrder.cancelEffectiveAt?.getTime() ?? "none",
        ].join(":"),
        occurredAt: now,
      }).onConflictDoNothing();
    }

    return {
      found: true,
      updated: changed,
      accessChanged,
      purchasesRevoked,
    };
  });
}

type SubscriptionState = Pick<
  typeof orders.$inferSelect,
  "status" | "subscriptionStatus" | "cancelAtPeriodEnd" | "cancelEffectiveAt" | "nextBillingAt"
>;

function subscriptionStateGrantsAccess(state: SubscriptionState, now: Date): boolean {
  if (state.status !== "completed") return false;
  const paidThrough = state.cancelEffectiveAt ?? state.nextBillingAt;
  if (state.cancelAtPeriodEnd || state.subscriptionStatus === "canceled") {
    return Boolean(paidThrough && paidThrough > now);
  }
  // Null is the historical one-time/unknown-subscription state and currently
  // grants access when a completed order has a purchase. Preserve that contract
  // until provider evidence supplies an explicit subscription state.
  if (!state.subscriptionStatus || state.subscriptionStatus === "active") return true;
  return false;
}

function isRecoverableSubscriptionRevocation(
  revokedBy: string | null,
  orderStatus: string,
): boolean {
  if (!revokedBy) return false;
  if (
    revokedBy.startsWith("reconcile.") ||
    revokedBy.startsWith("rebuild-orders.") ||
    revokedBy.startsWith("subscription.") ||
    revokedBy.startsWith("provider-sync:")
  ) {
    return true;
  }
  return revokedBy === "callback.portaly" && orderStatus === "canceled";
}

function subscriptionStateIsTerminal(state: SubscriptionState, now: Date): boolean {
  if (state.subscriptionStatus === "expired") return true;
  if (state.subscriptionStatus === "canceled" || state.cancelAtPeriodEnd) {
    const paidThrough = state.cancelEffectiveAt ?? state.nextBillingAt;
    return !paidThrough || paidThrough <= now;
  }
  return false;
}

function subscriptionFieldsChanged(
  current: typeof orders.$inferSelect,
  changes: EntitlementOrderChanges,
): boolean {
  return Object.entries(changes).some(([key, next]) => {
    const previous = current[key as keyof typeof current];
    if (previous instanceof Date || next instanceof Date) {
      const previousTime = previous instanceof Date ? previous.getTime() : previous;
      const nextTime = next instanceof Date ? next.getTime() : next;
      return previousTime !== nextTime;
    }
    return previous !== next;
  });
}
