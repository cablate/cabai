import crypto from "node:crypto";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  entitlementOutbox,
  orders,
  plans,
  userPurchases,
  users,
} from "@/lib/db/schema";
import { syncDiscordRolesForPlan } from "@/lib/discord";
import { enqueueEntitlementWebhooks, type EntitlementEvent } from "@/lib/webhook-outbox";
import { createLogger } from "@/lib/logger";
import { revokePurchaseEntitlement } from "@/lib/entitlement-transitions";
import { getEntitledPlanIds } from "@/lib/access";

const logger = createLogger("entitlement-outbox");
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 5_000, 30_000, 300_000, 1_800_000];
const LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;

type OutboxEvent = typeof entitlementOutbox.$inferSelect;

export interface ProcessEntitlementOutboxResult {
  scanned: number;
  claimed: number;
  processed: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  skipped: number;
  errors: number;
}

export async function processPendingEntitlementOutbox(
  options: { limit?: number; workerId?: string } = {},
): Promise<ProcessEntitlementOutboxResult> {
  const limit = normalizeLimit(options.limit);
  const workerId = options.workerId ?? `entitlement-${crypto.randomUUID()}`;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TTL_MS);
  const expiryErrors = await persistExpiredPurchaseTransitions(now, limit);
  const candidates = await db
    .select({ id: entitlementOutbox.id })
    .from(entitlementOutbox)
    .where(and(
      lt(entitlementOutbox.attempts, MAX_ATTEMPTS),
      or(
        eq(entitlementOutbox.status, "pending"),
        and(
          eq(entitlementOutbox.status, "failed"),
          or(isNull(entitlementOutbox.nextRetryAt), lte(entitlementOutbox.nextRetryAt, now)),
        ),
        and(
          eq(entitlementOutbox.status, "processing"),
          lt(entitlementOutbox.lockedAt, staleBefore),
        ),
      ),
    ))
    .orderBy(asc(entitlementOutbox.createdAt))
    .limit(limit);

  const result: ProcessEntitlementOutboxResult = {
    scanned: candidates.length,
    claimed: 0,
    processed: 0,
    delivered: 0,
    failed: 0,
    deadLetter: 0,
    skipped: 0,
    errors: expiryErrors,
  };

  for (const candidate of candidates) {
    const event = await claimEvent(candidate.id, workerId, staleBefore);
    if (!event) {
      result.skipped++;
      continue;
    }
    result.claimed++;
    result.processed++;

    try {
      await processClaimedEvent(event);
      result.delivered++;
    } catch (error) {
      const nextAttempt = event.attempts + 1;
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Unknown entitlement delivery error.";
      try {
        if (nextAttempt >= MAX_ATTEMPTS) {
          await markDeadLetter(event.id, nextAttempt, message);
          result.deadLetter++;
        } else {
          await markFailed(event.id, nextAttempt, message);
          result.failed++;
        }
      } catch (persistError) {
        result.errors++;
        logger.error("Failed to persist entitlement outbox failure", {
          eventId: event.id,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
      }
    }
  }

  return result;
}

async function persistExpiredPurchaseTransitions(now: Date, limit: number): Promise<number> {
  const expired = await db
    .select({ id: userPurchases.id })
    .from(userPurchases)
    .where(and(
      isNull(userPurchases.revokedAt),
      lte(userPurchases.expiresAt, now),
    ))
    .orderBy(asc(userPurchases.expiresAt))
    .limit(limit);

  let errors = 0;
  for (const purchase of expired) {
    try {
      await revokePurchaseEntitlement({
        purchaseId: purchase.id,
        revokedBy: "entitlement.expiry",
        triggeredBy: "entitlement.expiry",
        occurredAt: now,
      });
    } catch (error) {
      errors++;
      logger.error("Failed to persist expired entitlement transition", {
        purchaseId: purchase.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return errors;
}

async function claimEvent(id: string, workerId: string, staleBefore: Date): Promise<OutboxEvent | null> {
  const now = new Date();
  const [claimed] = await db
    .update(entitlementOutbox)
    .set({ status: "processing", lockedAt: now, lockedBy: workerId, updatedAt: now })
    .where(and(
      eq(entitlementOutbox.id, id),
      lt(entitlementOutbox.attempts, MAX_ATTEMPTS),
      or(
        eq(entitlementOutbox.status, "pending"),
        and(
          eq(entitlementOutbox.status, "failed"),
          or(isNull(entitlementOutbox.nextRetryAt), lte(entitlementOutbox.nextRetryAt, now)),
        ),
        and(
          eq(entitlementOutbox.status, "processing"),
          lt(entitlementOutbox.lockedAt, staleBefore),
        ),
      ),
    ))
    .returning();
  return claimed ?? null;
}

async function processClaimedEvent(event: OutboxEvent): Promise<void> {
  if (!event.webhookEnqueuedAt) {
    const currentlyEntitled = (await getEntitledPlanIds(event.userId)).has(event.planId);
    const transitionMatchesCurrentState = event.eventType === "entitlement.granted"
      ? currentlyEntitled
      : !currentlyEntitled;
    if (transitionMatchesCurrentState) {
      const payload = await buildWebhookEvent(event);
      await enqueueEntitlementWebhooks(payload);
    } else {
      logger.info("Skipped superseded entitlement webhook transition", {
        eventId: event.id,
        eventType: event.eventType,
      });
    }
    await db
      .update(entitlementOutbox)
      .set({ webhookEnqueuedAt: new Date(), updatedAt: new Date() })
      .where(eq(entitlementOutbox.id, event.id));
  }

  if (!event.discordSyncedAt) {
    const sync = await syncDiscordRolesForPlan(event.userId, event.planId);
    if (!sync.ok) {
      const statuses = sync.failures.map((failure) => failure.status || "network").join(",");
      throw new Error(`Discord role synchronization failed (${statuses || "unknown"}).`);
    }
    await db
      .update(entitlementOutbox)
      .set({ discordSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(entitlementOutbox.id, event.id));
  }

  await db
    .update(entitlementOutbox)
    .set({
      status: "delivered",
      attempts: event.attempts + 1,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(entitlementOutbox.id, event.id));
}

async function buildWebhookEvent(event: OutboxEvent): Promise<EntitlementEvent> {
  const [user, plan, order, purchase] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, event.userId) }),
    db.query.plans.findFirst({ where: eq(plans.id, event.planId) }),
    event.orderId ? db.query.orders.findFirst({ where: eq(orders.id, event.orderId) }) : null,
    event.purchaseId ? db.query.userPurchases.findFirst({ where: eq(userPurchases.id, event.purchaseId) }) : null,
  ]);
  if (!user || !plan) throw new Error("Entitlement outbox references a missing user or plan.");

  const source: EntitlementEvent["source"] = event.source === "subscription" || order?.subscriptionId
    ? "subscription"
    : event.source === "manual" || event.source === "free_claim"
      ? "manual"
      : "one-time";

  return {
    eventType: event.eventType,
    userId: event.userId,
    userEmail: user.email ?? "",
    userName: user.name,
    planId: event.planId,
    planName: plan.name,
    billingPeriod: plan.billingPeriod,
    orderId: event.orderId,
    source,
    grantedAt: (purchase?.grantedAt ?? event.occurredAt).toISOString(),
    expiresAt: purchase?.expiresAt?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(order?.cancelAtPeriodEnd),
    triggeredBy: event.triggeredBy,
  };
}

async function markFailed(id: string, attempts: number, message: string): Promise<void> {
  const delay = RETRY_DELAYS_MS[attempts] ?? RETRY_DELAYS_MS.at(-1) ?? 1_800_000;
  await db
    .update(entitlementOutbox)
    .set({
      status: "failed",
      attempts,
      nextRetryAt: new Date(Date.now() + delay),
      lockedAt: null,
      lockedBy: null,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(eq(entitlementOutbox.id, id));
}

async function markDeadLetter(id: string, attempts: number, message: string): Promise<void> {
  await db
    .update(entitlementOutbox)
    .set({
      status: "dead_letter",
      attempts,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(eq(entitlementOutbox.id, id));
  logger.error("DEAD LETTER", { eventId: id, reason: message });
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, Math.floor(limit)));
}
