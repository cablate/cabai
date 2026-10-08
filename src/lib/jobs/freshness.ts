import type { JobRun } from "@/lib/db/schema";
import { getJobFreshnessRows } from "./ledger";
import { jobIds, type JobId } from "./ids";

const minute = 60_000;
export const jobFreshnessThresholdMs: Record<JobId, number> = {
  "webhook-outbox": 15 * minute,
  "database-backup": 75 * minute,
  "cleanup-orders": 2 * 60 * minute,
  "media-cleanup": 2 * 60 * minute,
  "subscription-reconciliation": 14 * 60 * minute,
  "provider-sync": 3 * minute,
};

export type JobFreshnessState = "fresh" | "pending" | "failed" | "stale";

export interface JobFreshnessStatus {
  jobId: JobId;
  state: JobFreshnessState;
  code: "JOB_FRESH" | "JOB_INITIAL_GRACE" | "JOB_FAILED" | "JOB_NEVER_SUCCEEDED" | "JOB_SUCCESS_STALE";
  thresholdSeconds: number;
  ageSeconds?: number;
}

export interface JobFreshnessRow {
  jobId: JobId;
  latest: Pick<JobRun, "status" | "startedAt" | "finishedAt"> | null;
  latestSuccess: Pick<JobRun, "status" | "startedAt" | "finishedAt"> | null;
}

const processStartedAt = new Date();

function seconds(value: number): number {
  return Math.max(0, Math.floor(value / 1_000));
}

export function evaluateJobFreshness(options: {
  rows: JobFreshnessRow[];
  enabledJobIds: readonly JobId[];
  now?: Date;
  graceStartedAt?: Date;
}): JobFreshnessStatus[] {
  const now = options.now ?? new Date();
  const graceStartedAt = options.graceStartedAt ?? processStartedAt;
  const byJob = new Map(options.rows.map((row) => [row.jobId, row]));

  return options.enabledJobIds.map((jobId) => {
    const row = byJob.get(jobId);
    const thresholdMs = jobFreshnessThresholdMs[jobId];
    const thresholdSeconds = seconds(thresholdMs);
    const latestFailed = row?.latest?.status === "failed" || row?.latest?.status === "interrupted";
    const latestSuccessAt = row?.latestSuccess?.finishedAt ?? row?.latestSuccess?.startedAt;

    if (latestFailed && (!latestSuccessAt || row!.latest!.startedAt >= latestSuccessAt)) {
      return { jobId, state: "failed", code: "JOB_FAILED", thresholdSeconds };
    }
    if (!latestSuccessAt) {
      const ageMs = now.getTime() - graceStartedAt.getTime();
      return ageMs > thresholdMs
        ? { jobId, state: "stale", code: "JOB_NEVER_SUCCEEDED", thresholdSeconds, ageSeconds: seconds(ageMs) }
        : { jobId, state: "pending", code: "JOB_INITIAL_GRACE", thresholdSeconds, ageSeconds: seconds(ageMs) };
    }

    const ageMs = now.getTime() - latestSuccessAt.getTime();
    return ageMs > thresholdMs
      ? { jobId, state: "stale", code: "JOB_SUCCESS_STALE", thresholdSeconds, ageSeconds: seconds(ageMs) }
      : { jobId, state: "fresh", code: "JOB_FRESH", thresholdSeconds, ageSeconds: seconds(ageMs) };
  });
}

export async function inspectJobFreshness(options: {
  schedulerEnabled: boolean;
  backupEnabled: boolean;
  now?: Date;
}): Promise<JobFreshnessStatus[]> {
  if (!options.schedulerEnabled) return [];
  const enabledJobIds = jobIds.filter((jobId) => jobId !== "database-backup" || options.backupEnabled);
  const rows = await getJobFreshnessRows();
  return evaluateJobFreshness({ rows, enabledJobIds, now: options.now });
}
