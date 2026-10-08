import { createLogger } from "@/lib/logger";
import { captureOperationalMessage } from "@/lib/observability/capture";
import type { JobTrigger } from "./ledger";
import type { JobId } from "./ids";

const logger = createLogger("job-alerts");

export interface JobFailureAlert {
  kind: "job_failure";
  jobId: JobId;
  trigger: JobTrigger;
  triggerId?: string;
  errorCode: "JOB_EXECUTION_FAILED";
}

export type JobAlertSink = (alert: JobFailureAlert) => void | Promise<void>;

const logAlert: JobAlertSink = (alert) => {
  logger.error("Scheduled job failed", { ...alert });
  captureOperationalMessage("Scheduled job failed", "error", {
    errorCode: alert.errorCode,
    jobId: alert.jobId,
    surface: "job",
    trigger: alert.trigger,
  });
};

export async function emitJobFailureAlert(
  context: Pick<JobFailureAlert, "jobId" | "trigger" | "triggerId">,
  sink: JobAlertSink = logAlert,
): Promise<void> {
  const alert: JobFailureAlert = {
    kind: "job_failure",
    jobId: context.jobId,
    trigger: context.trigger,
    ...(context.triggerId ? { triggerId: context.triggerId } : {}),
    errorCode: "JOB_EXECUTION_FAILED",
  };

  try {
    await sink(alert);
  } catch {
    // An optional provider must never turn a completed job failure into an
    // unhandled rejection. The fallback is intentionally redacted.
    logger.error("Job alert provider failed", { ...alert });
  }
}
