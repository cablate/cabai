import crypto from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceConfigs, webhookLogs } from "@/lib/db/schema";

export interface EntitlementEvent {
  eventType: "entitlement.granted" | "entitlement.revoked" | "entitlement.renewed";
  userId: string;
  userEmail: string;
  userName?: string | null;
  planId: string;
  planName: string;
  billingPeriod: string;
  orderId?: string | null;
  source: "subscription" | "one-time" | "manual";
  grantedAt: string;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  triggeredBy?: string;
}

export interface EnqueueResult {
  matchedServices: number;
  enqueued: number;
}

/**
 * Durable outbox enqueue.
 *
 * This function only writes webhook_logs rows. It intentionally does not send
 * HTTP requests or schedule in-memory retries; delivery is handled by the cron
 * processor in webhook-processor.ts.
 */
export async function enqueueEntitlementWebhooks(
  event: EntitlementEvent,
): Promise<EnqueueResult> {
  const configs = await db
    .select()
    .from(serviceConfigs)
    .where(
      and(
        eq(serviceConfigs.planId, event.planId),
        eq(serviceConfigs.isActive, true),
        isNull(serviceConfigs.deletedAt),
      ),
    );

  let enqueued = 0;

  for (const config of configs) {
    const idempotencyKey = buildIdempotencyKey(event, config.id);
    const payload = buildPayload(event, idempotencyKey);

    await db.insert(webhookLogs).values({
      serviceConfigId: config.id,
      orderId: event.orderId ?? null,
      userId: event.userId,
      eventType: event.eventType,
      payloadJson: JSON.stringify(payload),
      idempotencyKey,
      status: "pending",
      attempts: 0,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    }).onConflictDoNothing();

    enqueued++;
  }

  return { matchedServices: configs.length, enqueued };
}

/**
 * Backward-compatible name while callers migrate from push semantics to outbox
 * semantics. This does not push; it only enqueues durable work.
 */
export const pushToServices = enqueueEntitlementWebhooks;

/**
 * L2 cooldown check: returns true if a push was already created within the last
 * hour for the user+plan+event tuple.
 */
export async function hasRecentPush(
  userId: string,
  planId: string,
  eventType: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recent = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .innerJoin(serviceConfigs, eq(webhookLogs.serviceConfigId, serviceConfigs.id))
    .where(
      and(
        eq(webhookLogs.userId, userId),
        eq(serviceConfigs.planId, planId),
        eq(webhookLogs.eventType, eventType),
        gte(webhookLogs.createdAt, oneHourAgo),
      ),
    )
    .limit(1);

  return recent.length > 0;
}

function buildIdempotencyKey(
  event: EntitlementEvent,
  serviceConfigId: string,
): string {
  const eventScope = event.orderId ?? `${event.triggeredBy ?? "manual"}:${event.grantedAt}`;
  const raw = JSON.stringify([
    event.eventType,
    event.userId,
    event.planId,
    serviceConfigId,
    eventScope,
  ]);
  const digest = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `evt_${digest}`;
}

function buildPayload(
  event: EntitlementEvent,
  idempotencyKey: string,
): Record<string, unknown> {
  return {
    event: event.eventType,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString(),
    user: {
      email: event.userEmail,
      name: event.userName ?? null,
    },
    plan: {
      id: event.planId,
      name: event.planName,
      billing_period: event.billingPeriod,
    },
    entitlement: {
      source: event.source,
      granted_at: event.grantedAt,
      expires_at: event.expiresAt,
      cancel_at_period_end: event.cancelAtPeriodEnd,
    },
    triggered_by: event.triggeredBy ?? "callback",
  };
}
