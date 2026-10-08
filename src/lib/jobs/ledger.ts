import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobRuns, type JobRun } from "@/lib/db/schema";
import { jobIds, type JobId } from "./ids";

export const jobTriggers = ["in_process", "external_cron", "admin", "system"] as const;
export type JobTrigger = (typeof jobTriggers)[number];
export type SafeJobSummary = Record<string, number>;

export interface JobRunIdentity {
  id: string;
  jobId: JobId;
  trigger: JobTrigger;
  triggerId?: string;
  runnerId: string;
  appVersion: string;
  startedAt: Date;
  deadlineAt?: Date;
}

const INTERRUPTED_ERROR_CODE = "RUNNER_INTERRUPTED";
const INTERRUPTED_ERROR_SUMMARY = "Previous runner stopped before recording a terminal result";
const FAILED_ERROR_CODE = "JOB_EXECUTION_FAILED";
const FAILED_ERROR_SUMMARY = "Job execution failed; inspect protected logs with the run ID";

export async function interruptPreviousAndStartJobRun(input: JobRunIdentity): Promise<void> {
  await db.transaction(async (tx) => {
    const interruptedAt = new Date();
    await tx
      .update(jobRuns)
      .set({
        status: "interrupted",
        finishedAt: interruptedAt,
        errorCode: INTERRUPTED_ERROR_CODE,
        errorSummary: INTERRUPTED_ERROR_SUMMARY,
      })
      .where(and(eq(jobRuns.jobKey, input.jobId), eq(jobRuns.status, "running")));

    await tx.insert(jobRuns).values({
      id: input.id,
      jobKey: input.jobId,
      trigger: input.trigger,
      triggerId: input.triggerId,
      status: "running",
      startedAt: input.startedAt,
      deadlineAt: input.deadlineAt,
      runnerId: input.runnerId,
      appVersion: input.appVersion,
    });
  });
}

export async function recordSkippedJobRun(input: JobRunIdentity): Promise<void> {
  const finishedAt = new Date();
  await db.insert(jobRuns).values({
    id: input.id,
    jobKey: input.jobId,
    trigger: input.trigger,
    triggerId: input.triggerId,
    status: "skipped",
    startedAt: input.startedAt,
    finishedAt,
    deadlineAt: input.deadlineAt,
    runnerId: input.runnerId,
    appVersion: input.appVersion,
  });
}

export async function recordSucceededJobRun(
  id: string,
  safeSummary: SafeJobSummary,
): Promise<boolean> {
  const updated = await db
    .update(jobRuns)
    .set({ status: "succeeded", finishedAt: new Date(), safeSummary })
    .where(and(eq(jobRuns.id, id), eq(jobRuns.status, "running")))
    .returning({ id: jobRuns.id });
  return updated.length === 1;
}

export async function recordFailedJobRun(id: string): Promise<boolean> {
  const updated = await db
    .update(jobRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorCode: FAILED_ERROR_CODE,
      errorSummary: FAILED_ERROR_SUMMARY,
    })
    .where(and(eq(jobRuns.id, id), eq(jobRuns.status, "running")))
    .returning({ id: jobRuns.id });
  return updated.length === 1;
}

export async function getLatestJobRun(jobId: JobId): Promise<JobRun | null> {
  const [run] = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.jobKey, jobId))
    .orderBy(desc(jobRuns.startedAt), desc(jobRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function getLatestSuccessfulJobRun(jobId: JobId): Promise<JobRun | null> {
  const [run] = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobKey, jobId), eq(jobRuns.status, "succeeded")))
    .orderBy(desc(jobRuns.finishedAt), desc(jobRuns.startedAt))
    .limit(1);
  return run ?? null;
}

export async function getLatestJobRuns(): Promise<Array<{ jobId: JobId; run: JobRun | null }>> {
  return Promise.all(jobIds.map(async (jobId) => ({ jobId, run: await getLatestJobRun(jobId) })));
}

export async function getJobFreshnessRows(): Promise<Array<{
  jobId: JobId;
  latest: JobRun | null;
  latestSuccess: JobRun | null;
}>> {
  return Promise.all(jobIds.map(async (jobId) => ({
    jobId,
    latest: await getLatestJobRun(jobId),
    latestSuccess: await getLatestSuccessfulJobRun(jobId),
  })));
}

export function isJobRunOverdue(
  run: Pick<JobRun, "status" | "deadlineAt">,
  now = new Date(),
): boolean {
  return run.status === "running" && run.deadlineAt !== null && run.deadlineAt < now;
}
