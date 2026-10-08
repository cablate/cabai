import { db } from "@/lib/db";
import { userPurchases, orders, plans, users } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { listSubscriptions } from "@/lib/portaly";
import { createLogger } from "@/lib/logger";
import { maskEmail } from "@/lib/log-redact";
import { writeAuditLog } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";
import { ensurePaymentPurchaseInTransaction } from "@/lib/entitlement-transitions";
import {
  normalizePortalySubscriptionFields,
  parseProviderDate,
} from "@/lib/subscription-state";

const logger = createLogger("access");

// F-06: cap how often a single (userId, planId) pair can trigger the
// Portaly fallback. Without this, a bad actor or buggy client repeatedly
// hitting protected content could spam Portaly and (worse) repeatedly
// write self-heal records.
const selfHealLimiter = createRateLimiter("self-heal", {
  limit: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
});

export type AccessResult =
  | { hasAccess: true; source: "manual" | "one-time" | "subscription" }
  | { hasAccess: false };

const SUBSCRIPTION_STALE_AFTER_DAYS = 35;

export type LocalPaymentOrderSnapshot = Pick<
  typeof orders.$inferSelect,
  | "status"
  | "subscriptionStatus"
  | "cancelAtPeriodEnd"
  | "cancelEffectiveAt"
  | "nextBillingAt"
  | "createdAt"
>;

/** Shared local entitlement decision used by content, Discord and service APIs. */
export function localPaymentOrderGrantsAccess(
  order: LocalPaymentOrderSnapshot,
  purchaseExpiresAt: Date | null,
  now = new Date(),
): boolean {
  if (purchaseExpiresAt && purchaseExpiresAt < now) return false;
  if (order.status !== "completed") return false;

  if (!order.subscriptionStatus) return true;
  if (order.cancelAtPeriodEnd || order.subscriptionStatus === "canceled") {
    const paidThrough = order.cancelEffectiveAt ?? order.nextBillingAt;
    return Boolean(paidThrough && paidThrough > now);
  }
  if (order.subscriptionStatus === "active") {
    const referenceDate = order.nextBillingAt ?? order.createdAt;
    const staleDays = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
    return staleDays <= SUBSCRIPTION_STALE_AFTER_DAYS;
  }
  return false;
}

/**
 * Check if a user has access to a plan's content.
 *
 * Flow:
 * 1. Check local userPurchases (manual grants, one-time, subscription w/ Portaly live check)
 * 2. If local has nothing → fallback: query Portaly subscriptions by email
 * 3. If Portaly has active subscription for this plan → allow + self-heal local records
 */
export async function checkPlanAccess(
  userId: string,
  planId: string,
  userEmail?: string | null,
  userRole?: string,
): Promise<AccessResult> {
  // Admin bypass is DB-authoritative; session/JWT role can be stale.
  if (userRole === "admin") {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    if (dbUser?.role === "admin") return { hasAccess: true, source: "manual" };
  }

  // ─── Step 1: Check local records ───
  // Exclude revoked grants so revoke (admin/agent) actually removes access.
  const purchases = await db
    .select({
      id: userPurchases.id,
      orderId: userPurchases.orderId,
      grantedBy: userPurchases.grantedBy,
      expiresAt: userPurchases.expiresAt,
    })
    .from(userPurchases)
    .where(
      and(
        eq(userPurchases.userId, userId),
        eq(userPurchases.planId, planId),
        isNull(userPurchases.revokedAt),
      ),
    );

  for (const purchase of purchases) {
    // Manual grant or free claim — no order needed, check expiry only.
    if (purchase.grantedBy === "manual" || purchase.grantedBy === "free_claim") {
      if (!purchase.expiresAt || purchase.expiresAt >= new Date()) {
        return { hasAccess: true, source: "manual" };
      }
      continue;
    }

    // Payment-based — find the order to check subscription status
    if (!purchase.orderId) {
      // No linked order but has purchase record — treat as one-time
      if (!purchase.expiresAt || purchase.expiresAt >= new Date()) {
        return { hasAccess: true, source: "one-time" };
      }
      continue;
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, purchase.orderId),
    });

    if (!order || !localPaymentOrderGrantsAccess(order, purchase.expiresAt)) continue;
    return {
      hasAccess: true,
      source: order.subscriptionStatus ? "subscription" : "one-time",
    };
  }

  // ─── Step 2: Portaly fallback (callback might have failed) ───
  // Trust boundary: userEmail MUST come from Auth.js session or a service-key-gated
  // API. If Portaly returns an active subscription for this email+plan, we self-heal
  // local records. Risk: stale Portaly data could briefly re-grant revoked access.
  if (!userEmail) return { hasAccess: false };

  // F-06: cap fallback frequency per (userId, planId) so a hot
  // unauthenticated polling loop or a permanently inconsistent state
  // can't trigger unlimited Portaly queries and self-heal writes.
  const limitKey = `${userId}:${planId}`;
  const rate = selfHealLimiter.check(limitKey);
  if (!rate.success) {
    logger.warn("Self-healing skipped: rate limit reached", {
      userId, planId, retryAfterMs: rate.retryAfterMs,
    });
    return { hasAccess: false };
  }

  try {
    const localPlan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      columns: { providerPlanId: true },
    });
    if (!localPlan) return { hasAccess: false };
    const providerPlanId = localPlan.providerPlanId ?? planId;

    const result = await listSubscriptions({
      customerEmail: userEmail,
      status: "active",
    });

    if (result.error || !result.data) return { hasAccess: false };

    for (const sub of result.data) {
      if (sub.planId !== providerPlanId) continue;

      // Found active subscription on Portaly that we don't have locally
      logger.warn("Self-healing: granting access via Portaly fallback", {
        userId,
        userEmail: maskEmail(userEmail),
        subscriptionId: sub.id,
        planId,
      });

      // F-06: emit audit log so operators can later distinguish self-heal
      // grants from regular callback grants. Fire-and-forget; never blocks.
      void writeAuditLog({
        actorType: "system",
        actorId: "access.self-heal",
        action: "self_heal_attempted",
        entityType: "userPurchase",
        entityId: `${userId}:${planId}`,
        metadata: {
          userId,
          userEmail,
          planId,
          subscriptionId: sub.id,
        },
      });

      // Self-heal: create local records so next check is fast. If the write
      // path itself fails (DB outage, constraint violation, etc.) we now
      // FAIL CLOSED — previously this returned hasAccess=true regardless,
      // which is a silent grant with no durable trace (F-06 / N-H2).
      try {
        await db.transaction(async (tx) => {
          let order = await tx.query.orders.findFirst({
            where: eq(orders.subscriptionId, sub.id),
            columns: { id: true, status: true, userId: true, planId: true },
          });

          if (order && (order.userId !== userId || order.planId !== planId)) {
            throw new Error("Provider subscription is already bound to another local owner or plan.");
          }

          if (order && !["pending", "completed"].includes(order.status)) {
            throw new Error("Existing provider order is in an explicitly revoked terminal state.");
          }

          if (!order) {
            const subscriptionFields = normalizePortalySubscriptionFields(sub);
            const [created] = await tx
              .insert(orders)
              .values({
                userId,
                planId,
                merchantOrderNumber: `reconciled-${sub.id}`,
                subscriptionId: sub.id,
                status: "completed",
                currency: sub.currency || "TWD",
                expectedAmount: sub.amount,
                expectedCurrency: sub.currency || "TWD",
                paidAmount: sub.amount,
                ...subscriptionFields,
                createdAt: parseProviderDate(sub.createdAt) ?? new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoNothing()
              .returning({
                id: orders.id,
                status: orders.status,
                userId: orders.userId,
                planId: orders.planId,
              });
            order = created ?? await tx.query.orders.findFirst({
              where: eq(orders.merchantOrderNumber, `reconciled-${sub.id}`),
              columns: { id: true, status: true, userId: true, planId: true },
            });
            if (order && (order.userId !== userId || order.planId !== planId)) {
              throw new Error("Reconciled order identity conflicts with the current user or plan.");
            }
          } else if (order.status === "pending") {
            const subscriptionFields = normalizePortalySubscriptionFields(sub);
            const [updated] = await tx
              .update(orders)
              .set({
                status: "completed",
                ...subscriptionFields,
                paidAmount: sub.amount,
                updatedAt: new Date(),
              })
              .where(eq(orders.id, order.id))
              .returning({
                id: orders.id,
                status: orders.status,
                userId: orders.userId,
                planId: orders.planId,
              });
            order = updated;
          }

          if (!order) throw new Error("Unable to persist self-healed subscription order.");

          const explicitlyRevoked = await tx.query.userPurchases.findFirst({
            where: and(
              eq(userPurchases.userId, userId),
              eq(userPurchases.planId, planId),
              eq(userPurchases.orderId, order.id),
            ),
            columns: { revokedAt: true },
          });
          if (explicitlyRevoked?.revokedAt) {
            throw new Error("Existing entitlement was explicitly revoked.");
          }

          await ensurePaymentPurchaseInTransaction(tx, {
            userId,
            planId,
            orderId: order.id,
            source: "subscription",
            triggeredBy: "access.self-heal",
            grantedAt: parseProviderDate(sub.createdAt) ?? undefined,
          });
        });

        return { hasAccess: true, source: "subscription" };
      } catch (err) {
        logger.error("Self-healing write failed — denying access (fail-closed)", {
          error: err instanceof Error ? err.message : String(err),
          userId,
          planId,
          subscriptionId: sub.id,
        });
        return { hasAccess: false };
      }
    }
  } catch {
    // Portaly API failure should not block access check
  }

  return { hasAccess: false };
}

/**
 * Local-only set of plan IDs the user currently has access to.
 *
 * Used by Discord role grant flows (`grantDiscordRolesForUser`) so role
 * grants reflect the same entitlement decision as `checkPlanAccess()`
 * rather than the older "non-revoked userPurchases row" shortcut.
 * Deliberately skips the Portaly self-heal fallback — Discord linking
 * happens often, and we don't want every link to spam Portaly.
 */
export async function getEntitledPlanIds(userId: string): Promise<Set<string>> {
  const purchases = await db
    .select({
      planId: userPurchases.planId,
      grantedBy: userPurchases.grantedBy,
      expiresAt: userPurchases.expiresAt,
      orderId: userPurchases.orderId,
    })
    .from(userPurchases)
    .where(and(eq(userPurchases.userId, userId), isNull(userPurchases.revokedAt)));

  if (purchases.length === 0) return new Set();

  const orderIds = purchases
    .map((p) => p.orderId)
    .filter((id): id is string => !!id);

  const orderRows = orderIds.length
    ? await db
        .select({
          id: orders.id,
          status: orders.status,
          subscriptionId: orders.subscriptionId,
          subscriptionStatus: orders.subscriptionStatus,
          cancelAtPeriodEnd: orders.cancelAtPeriodEnd,
          cancelEffectiveAt: orders.cancelEffectiveAt,
          nextBillingAt: orders.nextBillingAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(inArray(orders.id, orderIds))
    : [];
  const ordersById = new Map(orderRows.map((o) => [o.id, o]));

  const now = new Date();
  const entitled = new Set<string>();

  for (const p of purchases) {
    if (p.grantedBy === "manual" || p.grantedBy === "free_claim") {
      if (!p.expiresAt || p.expiresAt >= now) entitled.add(p.planId);
      continue;
    }
    if (!p.orderId) {
      if (!p.expiresAt || p.expiresAt >= now) entitled.add(p.planId);
      continue;
    }
    const order = ordersById.get(p.orderId);
    if (order && localPaymentOrderGrantsAccess(order, p.expiresAt, now)) {
      entitled.add(p.planId);
    }
  }

  return entitled;
}
