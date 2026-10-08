import { and, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api-route";
import { requireSnapshotBefore } from "@/lib/backup-guard";
import { db } from "@/lib/db";
import { providerSyncChangeSets, providerSyncJobs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { withProviderSyncHeartbeat } from "@/lib/provider-sync-heartbeat";
import {
  analyzeOrdersSnapshot,
  analyzeSubscriptionSnapshot,
  applyOrdersSyncSnapshot,
  applySubscriptionSyncSnapshot,
  prepareOrdersSyncForRunner,
  prepareSubscriptionSyncForRunner,
} from "@/lib/provider-sync-operations";
import {
  applyPlanSyncSnapshot,
  preparePlanSyncForRunner,
} from "@/lib/provider-sync-plans";
import {
  claimProviderSyncJob,
  finalizeProviderSyncJob,
  heartbeatProviderSyncJob,
  PROVIDER_SYNC_MAX_ATTEMPTS,
  ProviderSyncLeaseLostError,
  readProviderSyncSnapshot,
  requeueOrFailProviderSyncJob,
  type ProviderSyncJob,
  serializeProviderSyncSnapshot,
  persistProviderSyncExecutionSnapshot,
} from "@/lib/provider-sync-ledger";
import type { PortalyPlan } from "@/lib/portaly-types";
import type { PortalyRebuildSnapshot } from "@/lib/rebuild-orders";
import type { SubscriptionProviderSnapshot } from "@/lib/reconcile-subscriptions";

const logger = createLogger("provider-sync-runner");
const STALE_ERROR_CODE = "CHANGE_SET_STALE";

type PreparedSnapshot = {
  payload: unknown;
  sourceFingerprint: string;
  fingerprint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requirePlanSnapshot(value: unknown): PortalyPlan[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item)
    || typeof item.id !== "string"
    || typeof item.name !== "string"
    || typeof item.amount !== "number"
    || typeof item.currency !== "string"
    || typeof item.createdAt !== "string"
    || typeof item.updatedAt !== "string")) {
    throw new ApiError({ code: "PROVIDER_SNAPSHOT_UNSAFE", message: "Stored plan snapshot is invalid", status: 409 });
  }
  return value as PortalyPlan[];
}

function requireOrdersSnapshot(value: unknown): PortalyRebuildSnapshot {
  if (!isRecord(value)
    || (value.providerMode !== null && value.providerMode !== "test" && value.providerMode !== "live")
    || !Array.isArray(value.orders)
    || !Array.isArray(value.subscriptions)
    || typeof value.externalCalls !== "number") {
    throw new ApiError({ code: "PROVIDER_SNAPSHOT_UNSAFE", message: "Stored order snapshot is invalid", status: 409 });
  }
  return value as unknown as PortalyRebuildSnapshot;
}

function requireSubscriptionSnapshot(value: unknown): SubscriptionProviderSnapshot {
  if (!isRecord(value)
    || !isRecord(value.bySubscriptionId)
    || typeof value.externalCalls !== "number") {
    throw new ApiError({ code: "PROVIDER_SNAPSHOT_UNSAFE", message: "Stored subscription snapshot is invalid", status: 409 });
  }
  return value as unknown as SubscriptionProviderSnapshot;
}

async function getChangeSet(job: ProviderSyncJob) {
  const changeSet = await db.query.providerSyncChangeSets.findFirst({
    where: and(
      eq(providerSyncChangeSets.id, job.changeSetId),
      eq(providerSyncChangeSets.operation, job.operation),
      eq(providerSyncChangeSets.actorId, job.actorId),
    ),
  });
  if (!changeSet || changeSet.fingerprint !== job.requestFingerprint) {
    throw new ApiError({ code: "CHANGE_SET_UNAVAILABLE", message: "Provider sync change set is unavailable", status: 409 });
  }
  return changeSet;
}

async function prepareSnapshot(job: ProviderSyncJob): Promise<PreparedSnapshot> {
  switch (job.operation) {
    case "plans": {
      const prepared = await preparePlanSyncForRunner();
      return {
        payload: prepared.providerSnapshot,
        sourceFingerprint: prepared.sourceFingerprint,
        fingerprint: prepared.fingerprint,
      };
    }
    case "orders": {
      const prepared = await prepareOrdersSyncForRunner();
      return {
        payload: prepared.providerSnapshot,
        sourceFingerprint: prepared.sourceFingerprint,
        fingerprint: prepared.fingerprint,
      };
    }
    case "subscriptions": {
      const prepared = await prepareSubscriptionSyncForRunner();
      return {
        payload: prepared.providerSnapshot,
        sourceFingerprint: prepared.sourceFingerprint,
        fingerprint: prepared.fingerprint,
      };
    }
  }
}

function matchesChangeSet(
  changeSet: { sourceFingerprint: string; fingerprint: string },
  prepared: { sourceFingerprint: string; fingerprint: string },
): boolean {
  return changeSet.sourceFingerprint === prepared.sourceFingerprint
    && changeSet.fingerprint === prepared.fingerprint;
}

async function failStale(job: ProviderSyncJob, leaseOwner: string): Promise<void> {
  await finalizeProviderSyncJob({
    jobId: job.id,
    leaseOwner,
    status: "failed",
    errorCode: STALE_ERROR_CODE,
    result: { stale: true },
  });
}

async function ensureExecutionSnapshot(
  job: ProviderSyncJob,
  leaseOwner: string,
  payload: unknown,
): Promise<void> {
  let snapshotId = job.snapshotId;
  if (!snapshotId) {
    const snapshotOperation = job.operation === "plans"
      ? "sync-plans"
      : job.operation === "orders" ? "rebuild-orders" : "reconcile-subscriptions";
    try {
      snapshotId = await requireSnapshotBefore(snapshotOperation, {
        jobId: job.id,
        actorId: job.actorId,
        changeSetId: job.changeSetId,
      });
    } catch {
      throw new ApiError({ code: "SNAPSHOT_FAILED", message: "Pre-sync snapshot failed; operation was not run", status: 503 });
    }
  }
  await persistProviderSyncExecutionSnapshot({
    jobId: job.id,
    leaseOwner,
    operation: job.operation,
    snapshotId,
    providerSnapshot: payload,
  });
}

async function runFreshExecution(
  job: ProviderSyncJob,
  leaseOwner: string,
  changeSet: Awaited<ReturnType<typeof getChangeSet>>,
): Promise<boolean> {
  if (changeSet.expiresAt.getTime() <= Date.now()) {
    await failStale(job, leaseOwner);
    return false;
  }
  const prepared = await prepareSnapshot(job);
  if (!matchesChangeSet(changeSet, prepared)) {
    await failStale(job, leaseOwner);
    return false;
  }
  // Validate the exact JSON boundary before creating the recovery snapshot or
  // allowing the domain operation to write anything.
  const serialized = serializeProviderSyncSnapshot(job.operation, prepared.payload);
  const payload = serialized.payload;
  await ensureExecutionSnapshot(job, leaseOwner, payload);
  return true;
}

async function applySnapshot(job: ProviderSyncJob, leaseOwner: string, payload: unknown, resumed: boolean) {
  switch (job.operation) {
    case "plans": {
      return { ...(await applyPlanSyncSnapshot({
        jobId: job.id,
        leaseOwner,
        actorId: job.actorId,
        changeSetId: job.changeSetId,
        requestFingerprint: job.requestFingerprint,
        data: requirePlanSnapshot(payload),
      })), terminal: true };
    }
    case "orders": {
      const analysis = await analyzeOrdersSnapshot(requireOrdersSnapshot(payload));
      const result = await applyOrdersSyncSnapshot({ analysis, jobId: job.id, resumed });
      if (result.stale) {
        const final = await finalizeProviderSyncJob({
          jobId: job.id,
          leaseOwner,
          status: "failed",
          errorCode: STALE_ERROR_CODE,
          synced: result.synced,
          result: result.result,
        });
        return { job: final, terminal: true, stale: true };
      }
      const final = await finalizeProviderSyncJob({
        jobId: job.id,
        leaseOwner,
        status: result.partialFailure ? "partially_failed" : "succeeded",
        synced: result.synced,
        result: { ...result.result, postStateFingerprint: result.postStateFingerprint ?? null },
        errorCode: result.partialFailure ? "SYNC_PARTIAL_FAILURE" : null,
      });
      return { job: final, terminal: true, stale: false };
    }
    case "subscriptions": {
      const analysis = await analyzeSubscriptionSnapshot(requireSubscriptionSnapshot(payload));
      const result = await applySubscriptionSyncSnapshot({ analysis, jobId: job.id, resumed });
      if (result.stale) {
        const final = await finalizeProviderSyncJob({
          jobId: job.id,
          leaseOwner,
          status: "failed",
          errorCode: STALE_ERROR_CODE,
          synced: result.synced,
          result: result.result,
        });
        return { job: final, terminal: true, stale: true };
      }
      const final = await finalizeProviderSyncJob({
        jobId: job.id,
        leaseOwner,
        status: result.partialFailure ? "partially_failed" : "succeeded",
        synced: result.synced,
        result: { ...result.result, postStateFingerprint: result.postStateFingerprint ?? null },
        errorCode: result.partialFailure ? "SYNC_PARTIAL_FAILURE" : null,
      });
      return { job: final, terminal: true, stale: false };
    }
  }
}

function retryableError(error: unknown): boolean {
  if (error instanceof ProviderSyncLeaseLostError) return false;
  if (!(error instanceof ApiError)) return true;
  if (["CHANGE_SET_UNAVAILABLE", "CHANGE_SET_STALE", "PROVIDER_SNAPSHOT_UNSAFE"].includes(error.code)) return false;
  return error.status >= 500 || error.status === 429;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof ApiError && /^[A-Z0-9_]{1,80}$/.test(error.code)) return error.code;
  return "SYNC_EXECUTION_FAILED";
}

async function processClaimedJob(job: ProviderSyncJob, leaseOwner: string): Promise<"succeeded" | "partially_failed" | "failed" | "queued" | "lease_lost"> {
  if (job.attemptCount > PROVIDER_SYNC_MAX_ATTEMPTS) {
    await requeueOrFailProviderSyncJob({ jobId: job.id, leaseOwner, errorCode: "SYNC_ATTEMPTS_EXHAUSTED" });
    return "failed";
  }

  try {
    const outcome = await withProviderSyncHeartbeat({
      jobId: job.id,
      leaseOwner,
      heartbeat: heartbeatProviderSyncJob,
      onError: (error) => logger.error("Provider sync lease heartbeat failed", {
        jobId: job.id,
        errorCode: safeErrorCode(error),
      }),
      run: async () => {
      const changeSet = await getChangeSet(job);
      let payload: unknown;
      const resumed = Boolean(job.providerSnapshot);
      if (job.providerSnapshot) {
        payload = readProviderSyncSnapshot(job.operation, job.providerSnapshot);
      } else {
        const fresh = await runFreshExecution(job, leaseOwner, changeSet);
        if (!fresh) return null;
        // Re-read to get the lease-owned durable snapshot saved before apply.
        const current = await db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, job.id) });
        if (!current?.providerSnapshot) throw new Error("Provider sync execution snapshot was not persisted");
        payload = readProviderSyncSnapshot(job.operation, current.providerSnapshot);
      }
      return applySnapshot(job, leaseOwner, payload, resumed);
      },
    });
    if (outcome.lostLease) return "lease_lost";
    if (!outcome.value) return "failed";
    const result = outcome.value as { job: { status: string }; terminal?: boolean };
    if (!result.terminal) return "failed";
    return result.job.status as "succeeded" | "partially_failed" | "failed";
  } catch (error) {
    if (error instanceof ProviderSyncLeaseLostError) return "lease_lost";
    logger.error("Provider sync execution failed", {
      jobId: job.id,
      operation: job.operation,
      attemptCount: job.attemptCount,
      errorCode: safeErrorCode(error),
    });
    const state = retryableError(error)
      ? await requeueOrFailProviderSyncJob({ jobId: job.id, leaseOwner, errorCode: safeErrorCode(error) })
      : (await finalizeProviderSyncJob({
          jobId: job.id,
          leaseOwner,
          status: "failed",
          errorCode: safeErrorCode(error),
          result: { failed: true },
        }), "failed" as const);
    return state;
  }
}

export async function runProviderSyncBatch(limit = 1): Promise<{
  claimed: number;
  succeeded: number;
  partiallyFailed: number;
  failed: number;
  requeued: number;
  leaseLost: number;
}> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new ApiError({ code: "INVALID_BATCH_LIMIT", message: "Provider sync batch limit must be between 1 and 10", status: 400 });
  }
  const result = { claimed: 0, succeeded: 0, partiallyFailed: 0, failed: 0, requeued: 0, leaseLost: 0 };
  while (result.claimed < limit) {
    const claimed = await claimProviderSyncJob();
    if (!claimed) break;
    result.claimed++;
    const status = await processClaimedJob(claimed.job, claimed.leaseOwner);
    if (status === "succeeded") result.succeeded++;
    else if (status === "partially_failed") result.partiallyFailed++;
    else if (status === "failed") result.failed++;
    else if (status === "queued") result.requeued++;
    else result.leaseLost++;
  }
  return result;
}
