import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-route";
import { writeRequiredAuditLogInTransaction } from "@/lib/audit";
import { db } from "@/lib/db";
import { providerSyncChangeSets, providerSyncJobs } from "@/lib/db/schema";
import { fingerprintProviderSyncSource } from "@/lib/provider-sync-utils";

export const providerSyncOperations = ["plans", "orders", "subscriptions"] as const;
export type ProviderSyncOperation = (typeof providerSyncOperations)[number];
const CHANGE_SET_TTL_MS = 15 * 60 * 1000;

export const PROVIDER_SYNC_LEASE_MS = 2 * 60 * 1000;
export const PROVIDER_SYNC_MAX_ATTEMPTS = 5;
export const PROVIDER_SYNC_MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
export const PROVIDER_SYNC_QUEUE_STALE_AFTER_MS = 15 * 60 * 1000;

export type ProviderSyncPreviewData = {
  operation: ProviderSyncOperation;
  sourceFingerprint: string;
  fingerprint: string;
  counts: Record<string, number>;
  changes: Array<Record<string, unknown>>;
  externalCalls: number;
  warnings: string[];
};

export type ProviderSyncJob = typeof providerSyncJobs.$inferSelect;
export type ProviderSyncJobResponse = ReturnType<typeof toProviderSyncJobResponse>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ProviderSyncLeaseLostError extends Error {
  constructor() {
    super("Provider sync worker no longer owns the job lease");
    this.name = "ProviderSyncLeaseLostError";
  }
}

export function hashProviderSyncIdempotencyKey(key: string): string {
  if (key.length < 1 || key.length > 200 || !/^[!-~]+$/.test(key)) {
    throw new ApiError({ code: "INVALID_IDEMPOTENCY_KEY", message: "Invalid Idempotency-Key", status: 400 });
  }
  return createHash("sha256").update(key).digest("hex");
}

export function computeProviderSyncChangeSetFingerprint(input: Omit<ProviderSyncPreviewData, "fingerprint">): string {
  return fingerprintProviderSyncSource({
    operation: input.operation,
    sourceFingerprint: input.sourceFingerprint,
    counts: input.counts,
    changes: input.changes,
    externalCalls: input.externalCalls,
    warnings: input.warnings,
  });
}

export function toProviderSyncJobResponse(job: ProviderSyncJob) {
  return {
    id: job.id,
    operation: job.operation,
    changeSetId: job.changeSetId,
    snapshotId: job.snapshotId,
    status: job.status,
    attemptCount: job.attemptCount,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    synced: job.synced,
    result: job.result,
    auditId: job.auditId,
    errorCode: job.errorCode,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export async function persistProviderSyncChangeSet(actorId: string, preview: ProviderSyncPreviewData) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CHANGE_SET_TTL_MS);
  await db.insert(providerSyncChangeSets).values({
    id,
    operation: preview.operation,
    actorId,
    sourceFingerprint: preview.sourceFingerprint,
    fingerprint: preview.fingerprint,
    changes: preview.changes,
    counts: preview.counts,
    expiresAt,
  });
  return {
    changeSetId: id,
    operation: preview.operation,
    fingerprint: preview.fingerprint,
    counts: preview.counts,
    changes: preview.changes,
    externalCalls: preview.externalCalls,
    warnings: preview.warnings,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function providerSyncStateFingerprint(operation: ProviderSyncOperation): Promise<string> {
  const tables: Record<ProviderSyncOperation, string[]> = {
    plans: ["plans"],
    orders: ["orders", "user_purchases", "entitlement_outbox"],
    subscriptions: ["orders", "user_purchases", "entitlement_outbox"],
  };
  const hashes: Record<string, string> = {};
  for (const table of tables[operation]) {
    const result = await db.execute(sql.raw(
      `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text, '[]')) AS fingerprint FROM "${table}" t`,
    ));
    hashes[table] = String((result.rows[0] as { fingerprint?: string } | undefined)?.fingerprint ?? "");
  }
  return fingerprintProviderSyncSource(hashes);
}

function matchesRequest(
  previous: Pick<ProviderSyncJob, "changeSetId" | "requestFingerprint">,
  requested: { changeSetId: string; requestFingerprint: string },
): boolean {
  return previous.changeSetId === requested.changeSetId
    && previous.requestFingerprint === requested.requestFingerprint;
}

async function findIdempotentJob(
  operation: ProviderSyncOperation,
  actorId: string,
  idempotencyKeyHash: string,
) {
  return db.query.providerSyncJobs.findFirst({
    where: and(
      eq(providerSyncJobs.operation, operation),
      eq(providerSyncJobs.actorId, actorId),
      eq(providerSyncJobs.idempotencyKeyHash, idempotencyKeyHash),
    ),
  });
}

export async function enqueueProviderSyncJob(input: {
  actorId: string;
  agentName: string;
  idempotencyKey: string;
  changeSetId: string;
  requestFingerprint: string;
  operation: ProviderSyncOperation;
}): Promise<{ job: ProviderSyncJobResponse; replayed: boolean }> {
  const idempotencyKeyHash = hashProviderSyncIdempotencyKey(input.idempotencyKey);

  const enqueue = async () => db.transaction(async (tx) => {
    const previous = await tx.query.providerSyncJobs.findFirst({
      where: and(
        eq(providerSyncJobs.operation, input.operation),
        eq(providerSyncJobs.actorId, input.actorId),
        eq(providerSyncJobs.idempotencyKeyHash, idempotencyKeyHash),
      ),
    });
    if (previous) {
      if (!matchesRequest(previous, input)) {
        throw new ApiError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency-Key was already used for a different change set", status: 409 });
      }
      return { job: toProviderSyncJobResponse(previous), replayed: true };
    }

    const changeSet = await tx.query.providerSyncChangeSets.findFirst({
      where: and(
        eq(providerSyncChangeSets.id, input.changeSetId),
        eq(providerSyncChangeSets.operation, input.operation),
        eq(providerSyncChangeSets.actorId, input.actorId),
      ),
    });
    if (!changeSet) throw new ApiError({ code: "CHANGE_SET_NOT_FOUND", message: "Change set not found", status: 404 });
    if (changeSet.expiresAt.getTime() <= Date.now()) {
      throw new ApiError({ code: "CHANGE_SET_EXPIRED", message: "Change set expired; preview again", status: 409 });
    }
    if (changeSet.fingerprint !== input.requestFingerprint) {
      throw new ApiError({ code: "CHANGE_SET_MISMATCH", message: "Change-set fingerprint does not match", status: 409 });
    }

    const id = randomUUID();
    const now = new Date();
    const auditId = await writeRequiredAuditLogInTransaction(tx, {
      actorType: "agent",
      actorId: input.actorId,
      action: `queue_sync_${input.operation}`,
      entityType: "provider_sync_job",
      entityId: id,
      metadata: {
        agentName: input.agentName,
        changeSetId: input.changeSetId,
        status: "queued",
      },
    });
    const [job] = await tx.insert(providerSyncJobs).values({
      id,
      operation: input.operation,
      actorId: input.actorId,
      idempotencyKeyHash,
      changeSetId: input.changeSetId,
      requestFingerprint: input.requestFingerprint,
      status: "queued",
      auditId,
      startedAt: now,
      nextAttemptAt: now,
    }).returning();
    if (!job) throw new Error("Provider sync job was not created");
    return { job: toProviderSyncJobResponse(job), replayed: false };
  });

  try {
    return await enqueue();
  } catch (error) {
    // A parallel request can win the unique idempotency index after this
    // transaction read no existing row. The losing audit/job insert rolls
    // back together; read the winner and apply the ordinary replay contract.
    if ((error as { code?: string } | null)?.code !== "23505") throw error;
    const previous = await findIdempotentJob(input.operation, input.actorId, idempotencyKeyHash);
    if (!previous) throw error;
    if (!matchesRequest(previous, input)) {
      throw new ApiError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency-Key was already used for a different change set", status: 409 });
    }
    return { job: toProviderSyncJobResponse(previous), replayed: true };
  }
}

export async function claimProviderSyncJob(): Promise<{ job: ProviderSyncJob; leaseOwner: string } | null> {
  const leaseOwner = randomUUID();
  const claimed = await db.execute(sql`
    WITH candidate AS (
      SELECT id
      FROM provider_sync_jobs
      WHERE (status = 'queued' AND next_attempt_at <= now())
         OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= now()))
      ORDER BY next_attempt_at ASC, started_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE provider_sync_jobs AS job
    SET status = 'running',
        lease_owner = ${leaseOwner},
        lease_expires_at = now() + (${PROVIDER_SYNC_LEASE_MS} * interval '1 millisecond'),
        heartbeat_at = now(),
        attempt_count = job.attempt_count + 1
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.id
  `);
  const jobId = claimed.rows[0]?.id;
  if (typeof jobId !== "string") return null;
  const job = await db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, jobId) });
  if (!job || job.leaseOwner !== leaseOwner) return null;
  return { job, leaseOwner };
}

export async function heartbeatProviderSyncJob(jobId: string, leaseOwner: string): Promise<boolean> {
  const [updated] = await db.update(providerSyncJobs).set({
    leaseExpiresAt: sql`now() + (${PROVIDER_SYNC_LEASE_MS} * interval '1 millisecond')`,
    heartbeatAt: sql`now()`,
  }).where(and(
    eq(providerSyncJobs.id, jobId),
    eq(providerSyncJobs.status, "running"),
    eq(providerSyncJobs.leaseOwner, leaseOwner),
    sql`${providerSyncJobs.leaseExpiresAt} > now()`,
  )).returning({ id: providerSyncJobs.id });
  return Boolean(updated);
}

export function serializeProviderSyncSnapshot(
  operation: ProviderSyncOperation,
  payload: unknown,
): Record<string, unknown> {
  const active = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
      return;
    }
    if (typeof value !== "object") throw new Error(`Non-JSON value at ${path}`);
    if (value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      throw new Error(`Non-JSON object at ${path}`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      throw new Error(`Non-plain object at ${path}`);
    }
    if (active.has(value)) throw new Error(`Circular value at ${path}`);
    active.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) throw new Error(`Sparse array at ${path}[${index}]`);
        visit(value[index], `${path}[${index}]`);
      }
    } else {
      for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
    }
    active.delete(value);
  };

  try {
    visit(payload, "snapshot");
    const envelope = { version: 1, operation, payload };
    const serialized = JSON.stringify(envelope);
    if (Buffer.byteLength(serialized, "utf8") > PROVIDER_SYNC_MAX_SNAPSHOT_BYTES) {
      throw new Error("Provider snapshot exceeds the durable execution limit");
    }
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    throw new ApiError({
      code: "PROVIDER_SNAPSHOT_UNSAFE",
      message: "Provider snapshot could not be safely persisted; no provider sync changes were applied",
      status: 502,
    });
  }
}

export function readProviderSyncSnapshot(
  operation: ProviderSyncOperation,
  value: unknown,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError({ code: "PROVIDER_SNAPSHOT_UNSAFE", message: "Stored provider snapshot is invalid", status: 409 });
  }
  const envelope = value as { version?: unknown; operation?: unknown; payload?: unknown };
  if (envelope.version !== 1 || envelope.operation !== operation || !("payload" in envelope)) {
    throw new ApiError({ code: "PROVIDER_SNAPSHOT_UNSAFE", message: "Stored provider snapshot is invalid", status: 409 });
  }
  return (serializeProviderSyncSnapshot(operation, envelope.payload) as { payload: unknown }).payload;
}

export async function persistProviderSyncExecutionSnapshot(input: {
  jobId: string;
  leaseOwner: string;
  operation: ProviderSyncOperation;
  snapshotId: string;
  providerSnapshot: unknown;
}): Promise<void> {
  const serialized = serializeProviderSyncSnapshot(input.operation, input.providerSnapshot);
  const [updated] = await db.update(providerSyncJobs).set({
    snapshotId: input.snapshotId,
    providerSnapshot: serialized,
  }).where(and(
    eq(providerSyncJobs.id, input.jobId),
    eq(providerSyncJobs.status, "running"),
    eq(providerSyncJobs.leaseOwner, input.leaseOwner),
    sql`${providerSyncJobs.leaseExpiresAt} > now()`,
  )).returning({ id: providerSyncJobs.id });
  if (!updated) throw new ProviderSyncLeaseLostError();
}

function terminalAuditAction(operation: ProviderSyncOperation): string {
  return `sync_${operation}`;
}

export async function finalizeProviderSyncJobInTransaction(tx: DbTransaction, input: {
  jobId: string;
  leaseOwner: string;
  status: "succeeded" | "partially_failed" | "failed";
  synced?: number;
  result?: Record<string, unknown>;
  errorCode?: string | null;
}): Promise<ProviderSyncJobResponse> {
  const current = await tx.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, input.jobId) });
  if (!current || current.status !== "running" || current.leaseOwner !== input.leaseOwner) {
    throw new ProviderSyncLeaseLostError();
  }
  const finishedAt = new Date();
  const auditId = await writeRequiredAuditLogInTransaction(tx, {
    actorType: "agent",
    actorId: current.actorId,
    action: terminalAuditAction(current.operation),
    entityType: "provider_sync_job",
    entityId: current.id,
    metadata: {
      operation: current.operation,
      status: input.status,
      synced: input.synced ?? 0,
      attemptCount: current.attemptCount,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    },
  });
  const [updated] = await tx.update(providerSyncJobs).set({
    status: input.status,
    synced: input.synced ?? null,
    result: input.result ?? null,
    auditId,
    errorCode: input.errorCode ?? null,
    providerSnapshot: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: finishedAt,
    finishedAt,
  }).where(and(
    eq(providerSyncJobs.id, current.id),
    eq(providerSyncJobs.status, "running"),
    eq(providerSyncJobs.leaseOwner, input.leaseOwner),
    sql`${providerSyncJobs.leaseExpiresAt} > now()`,
  )).returning();
  if (!updated) throw new ProviderSyncLeaseLostError();
  return toProviderSyncJobResponse(updated);
}

export async function finalizeProviderSyncJob(input: {
  jobId: string;
  leaseOwner: string;
  status: "succeeded" | "partially_failed" | "failed";
  synced?: number;
  result?: Record<string, unknown>;
  errorCode?: string | null;
}): Promise<ProviderSyncJobResponse> {
  return db.transaction((tx) => finalizeProviderSyncJobInTransaction(tx, input));
}

export type ProviderSyncQueueHealth = {
  queuedCount: number;
  runningCount: number;
  oldestQueuedAt: string | null;
  oldestRunningAt: string | null;
  oldestQueuedAgeMs: number | null;
  oldestRunningAgeMs: number | null;
  expiredLeaseCount: number;
  oldestExpiredLeaseAgeMs: number | null;
  observedAt: string;
};

export async function inspectProviderSyncQueue(now = new Date()): Promise<ProviderSyncQueueHealth> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'queued')::int AS queued_count,
      count(*) FILTER (WHERE status = 'running')::int AS running_count,
      min(started_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
      min(started_at) FILTER (WHERE status = 'running') AS oldest_running_at,
      count(*) FILTER (WHERE status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= ${now}))::int AS expired_lease_count,
      min(coalesce(lease_expires_at, heartbeat_at, started_at)) FILTER (
        WHERE status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
      ) AS oldest_expired_lease_at
    FROM provider_sync_jobs
    WHERE status IN ('queued', 'running')
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  const date = (value: unknown): Date | null => value instanceof Date
    ? value
    : typeof value === "string" ? new Date(value) : null;
  const oldestQueued = date(row?.oldest_queued_at);
  const oldestRunning = date(row?.oldest_running_at);
  const oldestExpiredLease = date(row?.oldest_expired_lease_at);
  return {
    queuedCount: Number(row?.queued_count ?? 0),
    runningCount: Number(row?.running_count ?? 0),
    oldestQueuedAt: oldestQueued?.toISOString() ?? null,
    oldestRunningAt: oldestRunning?.toISOString() ?? null,
    oldestQueuedAgeMs: oldestQueued ? Math.max(0, now.getTime() - oldestQueued.getTime()) : null,
    oldestRunningAgeMs: oldestRunning ? Math.max(0, now.getTime() - oldestRunning.getTime()) : null,
    expiredLeaseCount: Number(row?.expired_lease_count ?? 0),
    oldestExpiredLeaseAgeMs: oldestExpiredLease ? Math.max(0, now.getTime() - oldestExpiredLease.getTime()) : null,
    observedAt: now.toISOString(),
  };
}

export function providerSyncHealthStatus(health: Pick<ProviderSyncQueueHealth, "oldestQueuedAgeMs" | "expiredLeaseCount">): "ok" | "degraded" {
  return health.expiredLeaseCount > 0
    || (health.oldestQueuedAgeMs !== null && health.oldestQueuedAgeMs > PROVIDER_SYNC_QUEUE_STALE_AFTER_MS)
    ? "degraded"
    : "ok";
}

export async function requeueOrFailProviderSyncJob(input: {
  jobId: string;
  leaseOwner: string;
  errorCode?: string;
  result?: Record<string, unknown>;
}): Promise<"queued" | "failed"> {
  return db.transaction(async (tx) => {
    const current = await tx.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, input.jobId) });
    if (!current || current.status !== "running" || current.leaseOwner !== input.leaseOwner) {
      throw new ProviderSyncLeaseLostError();
    }

    const now = new Date();
    if (current.attemptCount < PROVIDER_SYNC_MAX_ATTEMPTS) {
      const delayMs = Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, current.attemptCount - 1));
      const [updated] = await tx.update(providerSyncJobs).set({
        status: "queued",
        nextAttemptAt: new Date(now.getTime() + delayMs),
        errorCode: "SYNC_RETRY_PENDING",
        leaseOwner: null,
        leaseExpiresAt: null,
      }).where(and(
        eq(providerSyncJobs.id, current.id),
        eq(providerSyncJobs.status, "running"),
        eq(providerSyncJobs.leaseOwner, input.leaseOwner),
        sql`${providerSyncJobs.leaseExpiresAt} > now()`,
      )).returning({ id: providerSyncJobs.id });
      if (!updated) throw new ProviderSyncLeaseLostError();
      return "queued";
    }

    const auditId = await writeRequiredAuditLogInTransaction(tx, {
      actorType: "agent",
      actorId: current.actorId,
      action: terminalAuditAction(current.operation),
      entityType: "provider_sync_job",
      entityId: current.id,
      metadata: {
        operation: current.operation,
        status: "failed",
        attemptCount: current.attemptCount,
        errorCode: input.errorCode ?? "SYNC_ATTEMPTS_EXHAUSTED",
      },
    });
    const finishedAt = new Date();
    const [updated] = await tx.update(providerSyncJobs).set({
      status: "failed",
      result: input.result ?? null,
      errorCode: input.errorCode ?? "SYNC_ATTEMPTS_EXHAUSTED",
      auditId,
      providerSnapshot: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: finishedAt,
      finishedAt,
    }).where(and(
      eq(providerSyncJobs.id, current.id),
      eq(providerSyncJobs.status, "running"),
      eq(providerSyncJobs.leaseOwner, input.leaseOwner),
      sql`${providerSyncJobs.leaseExpiresAt} > now()`,
    )).returning({ id: providerSyncJobs.id });
    if (!updated) throw new ProviderSyncLeaseLostError();
    return "failed";
  });
}

export async function readProviderSyncJob(jobId: string, actorId: string) {
  const job = await db.query.providerSyncJobs.findFirst({
    where: and(eq(providerSyncJobs.id, jobId), eq(providerSyncJobs.actorId, actorId)),
  });
  return job ? toProviderSyncJobResponse(job) : null;
}

export async function recordProviderSyncAudit(jobId: string, auditId: string): Promise<void> {
  await db.update(providerSyncJobs).set({ auditId }).where(eq(providerSyncJobs.id, jobId));
}
