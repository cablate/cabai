import crypto from "node:crypto";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceConfigs, webhookLogs } from "@/lib/db/schema";
import { signPayload } from "@/lib/webhook-verify";
import { UnsafeOutboundUrlError } from "@/lib/url-safety";
import { postWebhook } from "@/lib/webhook-transport";
import { createLogger } from "@/lib/logger";

const logger = createLogger("webhook-processor");

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 5_000, 30_000, 300_000, 1_800_000];
const LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;

type WebhookLog = typeof webhookLogs.$inferSelect;

export interface ProcessWebhooksOptions {
  limit?: number;
  workerId?: string;
}

export interface ProcessWebhooksResult {
  ok: true;
  workerId: string;
  scanned: number;
  claimed: number;
  processed: number;
  sent: number;
  failed: number;
  deadLetter: number;
  skipped: number;
  errors: number;
}

type ProcessOutcome = "sent" | "failed" | "dead_letter" | "skipped" | "error";

export async function processPendingWebhooks(
  options: ProcessWebhooksOptions = {},
): Promise<ProcessWebhooksResult> {
  const limit = normalizeLimit(options.limit);
  const workerId = options.workerId ?? `webhook-${crypto.randomUUID()}`;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TTL_MS);

  const candidates = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .where(
      and(
        lt(webhookLogs.attempts, MAX_ATTEMPTS),
        or(
          eq(webhookLogs.status, "pending"),
          and(
            eq(webhookLogs.status, "failed"),
            or(isNull(webhookLogs.nextRetryAt), lte(webhookLogs.nextRetryAt, now)),
          ),
          and(
            eq(webhookLogs.status, "processing"),
            lt(webhookLogs.lockedAt, staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(webhookLogs.createdAt))
    .limit(limit);

  const result: ProcessWebhooksResult = {
    ok: true,
    workerId,
    scanned: candidates.length,
    claimed: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    deadLetter: 0,
    skipped: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    const claimed = await claimWebhook(candidate.id, workerId, staleBefore);
    if (!claimed) {
      result.skipped++;
      continue;
    }

    result.claimed++;
    const outcome = await processClaimedWebhook(claimed);
    result.processed++;

    if (outcome === "sent") result.sent++;
    if (outcome === "failed") result.failed++;
    if (outcome === "dead_letter") result.deadLetter++;
    if (outcome === "skipped") result.skipped++;
    if (outcome === "error") result.errors++;
  }

  return result;
}

async function claimWebhook(
  id: string,
  workerId: string,
  staleBefore: Date,
): Promise<WebhookLog | null> {
  const now = new Date();
  const [claimed] = await db
    .update(webhookLogs)
    .set({
      status: "processing",
      lockedAt: now,
      lockedBy: workerId,
      updatedAt: now,
    })
    .where(
      and(
        eq(webhookLogs.id, id),
        lt(webhookLogs.attempts, MAX_ATTEMPTS),
        or(
          eq(webhookLogs.status, "pending"),
          and(
            eq(webhookLogs.status, "failed"),
            or(isNull(webhookLogs.nextRetryAt), lte(webhookLogs.nextRetryAt, now)),
          ),
          and(
            eq(webhookLogs.status, "processing"),
            lt(webhookLogs.lockedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();

  return claimed ?? null;
}

async function processClaimedWebhook(log: WebhookLog): Promise<ProcessOutcome> {
  if (log.attempts >= MAX_ATTEMPTS) {
    await markDeadLetter(log, "Max attempts reached");
    return "dead_letter";
  }

  const config = await db.query.serviceConfigs.findFirst({
    where: and(eq(serviceConfigs.id, log.serviceConfigId), isNull(serviceConfigs.deletedAt)),
  });

  const nextAttempt = log.attempts + 1;

  if (!config || !config.isActive) {
    await markDeadLetter(log, "Service config not found, deleted, or inactive", nextAttempt);
    return "dead_letter";
  }

  let payload: unknown;
  try {
    payload = JSON.parse(log.payloadJson);
  } catch {
    await markDeadLetter(log, "Invalid webhook payload JSON", nextAttempt);
    return "dead_letter";
  }

  const timestamp = new Date().toISOString();
  const signature = signPayload(config.apiKeyHash, payload, timestamp);

  try {
    const response = await postWebhook(config.webhookUrl, {
      headers: {
        "Content-Type": "application/json",
        "x-entitlement-timestamp": timestamp,
        "x-entitlement-signature": signature,
        "x-entitlement-event": log.eventType,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await markSent(log, response.status, nextAttempt);
      return "sent";
    }

    const responseText = response.text;
    const errorMessage = `HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`;

    if (response.status >= 400 && response.status < 500) {
      await markDeadLetter(log, errorMessage, nextAttempt, response.status);
      return "dead_letter";
    }

    await markFailed(log, nextAttempt, response.status, errorMessage);
    return nextAttempt >= MAX_ATTEMPTS ? "dead_letter" : "failed";
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError) {
      await markDeadLetter(log, `Unsafe webhook URL: ${error.message}`, nextAttempt);
      return "dead_letter";
    }
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(log, nextAttempt, null, message);
    return nextAttempt >= MAX_ATTEMPTS ? "dead_letter" : "failed";
  }
}

async function markSent(
  log: WebhookLog,
  httpStatus: number,
  attempts: number,
): Promise<void> {
  await db
    .update(webhookLogs)
    .set({
      status: "sent",
      httpStatus,
      attempts,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(webhookLogs.id, log.id));
}

async function markFailed(
  log: WebhookLog,
  attempts: number,
  httpStatus: number | null,
  errorMessage: string,
): Promise<void> {
  if (attempts >= MAX_ATTEMPTS) {
    await markDeadLetter(log, errorMessage, attempts, httpStatus);
    return;
  }

  const delayMs = RETRY_DELAYS_MS[attempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 3_600_000;
  const nextRetryAt = new Date(Date.now() + delayMs);

  await db
    .update(webhookLogs)
    .set({
      status: "failed",
      httpStatus,
      attempts,
      nextRetryAt,
      lockedAt: null,
      lockedBy: null,
      lastError: errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(webhookLogs.id, log.id));
}

async function markDeadLetter(
  log: WebhookLog,
  reason: string,
  attempts = log.attempts,
  httpStatus: number | null = log.httpStatus,
): Promise<void> {
  await db
    .update(webhookLogs)
    .set({
      status: "dead_letter",
      httpStatus,
      attempts,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(eq(webhookLogs.id, log.id));

  logger.error("DEAD LETTER", { webhookId: log.id, reason });
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_BATCH_LIMIT;
  return Math.max(1, Math.min(MAX_BATCH_LIMIT, Math.floor(limit)));
}
