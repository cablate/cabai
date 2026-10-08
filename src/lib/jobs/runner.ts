import crypto from "node:crypto";
import { withCronLock } from "@/lib/cron-lock";
import { createLogger } from "@/lib/logger";
import {
  interruptPreviousAndStartJobRun,
  recordFailedJobRun,
  recordSkippedJobRun,
  recordSucceededJobRun,
  type JobTrigger,
} from "./ledger";
import { jobs, summarizeJobResult, type JobId } from "./registry";
import { emitJobFailureAlert, type JobAlertSink } from "./alerts";
import { redactOperationalText } from "@/lib/observability/sentry-scrub";

const logger = createLogger("job-runner");
const runnerId = crypto.randomUUID();

export interface JobRunStatus {
  jobId: JobId;
  state: "running" | "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

const statuses = new Map<JobId, JobRunStatus>();

export function getJobStatuses(): JobRunStatus[] {
  return [...statuses.values()].map((status) => ({ ...status }));
}

export interface JobRunContext {
  trigger?: JobTrigger;
  triggerId?: string;
  deadlineAt?: Date;
  alertSink?: JobAlertSink;
}

function appVersion(): string {
  return (process.env.APP_VERSION || process.env.GIT_COMMIT_SHA || "unknown").slice(0, 128);
}

function safeTriggerId(value: string | undefined): string | undefined {
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) return undefined;
  return value;
}

function safeErrorMessage(error: unknown): string {
  return redactOperationalText(error instanceof Error ? error.message : String(error));
}

export async function runJob(
  jobId: JobId,
  input?: Record<string, unknown>,
  context: JobRunContext = {},
): Promise<{
  executed: boolean;
  result?: unknown;
}> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const run = {
    id: crypto.randomUUID(),
    jobId,
    trigger: context.trigger ?? "system" as const,
    triggerId: safeTriggerId(context.triggerId),
    runnerId,
    appVersion: appVersion(),
    startedAt: startedAtDate,
    deadlineAt: context.deadlineAt,
  };
  statuses.set(jobId, { jobId, state: "running", startedAt });
  try {
    const locked = await withCronLock(`cron:${jobId}`, async () => {
      // The advisory lock proves any older running row belongs to a stopped
      // runner. Ledger setup is fail-closed and completes before business work.
      await interruptPreviousAndStartJobRun(run);

      let result: unknown;
      try {
        result = await jobs[jobId](input);
      } catch (error) {
        try {
          const recorded = await recordFailedJobRun(run.id);
          if (!recorded) {
            logger.error("Failed job status was not persisted", { jobId, runId: run.id });
          }
        } catch (ledgerError) {
          logger.error("Failed to persist failed job status", {
            jobId,
            runId: run.id,
            error: safeErrorMessage(ledgerError),
          });
        }
        throw error;
      }

      try {
        const recorded = await recordSucceededJobRun(run.id, summarizeJobResult(jobId, result));
        if (!recorded) {
          logger.error("Successful job status was not persisted", { jobId, runId: run.id });
        }
      } catch (ledgerError) {
        // Business side effects have already completed. Never turn this into a
        // retry signal that could execute the job twice.
        logger.error("Failed to persist successful job status", {
          jobId,
          runId: run.id,
          error: safeErrorMessage(ledgerError),
        });
      }
      return result;
    });
    if (!locked.locked) {
      await recordSkippedJobRun(run);
      statuses.set(jobId, { jobId, state: "skipped", startedAt, finishedAt: new Date().toISOString() });
      return { executed: false };
    }
    statuses.set(jobId, { jobId, state: "succeeded", startedAt, finishedAt: new Date().toISOString() });
    return { executed: true, result: locked.result };
  } catch (error) {
    const message = safeErrorMessage(error);
    statuses.set(jobId, { jobId, state: "failed", startedAt, finishedAt: new Date().toISOString(), error: message });
    logger.error("Job failed", { jobId, error: message });
    await emitJobFailureAlert({
      jobId,
      trigger: run.trigger,
      triggerId: run.triggerId,
    }, context.alertSink);
    throw error;
  }
}
