import cron from "node-cron";
import { createLogger } from "@/lib/logger";
import type { JobAlertSink } from "./alerts";
import { runJob } from "./runner";
import type { JobId } from "./ids";

const logger = createLogger("job-scheduler");
let scheduled = false;

export const schedulerModes = ["disabled", "in_process", "external"] as const;
export type SchedulerMode = (typeof schedulerModes)[number];

type SchedulerEnvironment = Partial<Pick<NodeJS.ProcessEnv, "SCHEDULER_MODE" | "SCHEDULED_TASKS_ENABLED">>;

export interface SchedulerOptions {
  mode?: SchedulerMode;
  env?: SchedulerEnvironment;
  alertSink?: JobAlertSink;
  disabledJobIds?: readonly JobId[];
}

const schedules: Array<{ id: JobId; expression: string }> = [
  { id: "database-backup", expression: "*/30 * * * *" },
  { id: "cleanup-orders", expression: "0 * * * *" },
  { id: "media-cleanup", expression: "10 * * * *" },
  { id: "webhook-outbox", expression: "*/5 * * * *" },
  { id: "subscription-reconciliation", expression: "0 6,18 * * *" },
  { id: "provider-sync", expression: "* * * * *" },
];

export function resolveSchedulerMode(env: SchedulerEnvironment = {
  SCHEDULER_MODE: process.env.SCHEDULER_MODE,
  SCHEDULED_TASKS_ENABLED: process.env.SCHEDULED_TASKS_ENABLED,
}): SchedulerMode {
  const configured = env.SCHEDULER_MODE?.trim();
  if (configured) {
    if (schedulerModes.includes(configured as SchedulerMode)) return configured as SchedulerMode;
    throw new Error("SCHEDULER_MODE must be disabled, in_process, or external");
  }

  // Compatibility for deployments configured before SCHEDULER_MODE existed.
  return env.SCHEDULED_TASKS_ENABLED?.trim().toLowerCase() === "true"
    ? "in_process"
    : "disabled";
}

export function scheduleRegisteredJobs(options: SchedulerOptions = {}): void {
  const mode = options.mode ?? resolveSchedulerMode(options.env);
  if (mode !== "in_process") {
    logger.info("In-process jobs are not registered", { schedulerMode: mode });
    return;
  }
  if (scheduled) return;
  scheduled = true;

  const disabledJobIds = new Set(options.disabledJobIds ?? []);
  const activeSchedules = schedules.filter((job) => !disabledJobIds.has(job.id));
  for (const job of activeSchedules) {
    cron.schedule(job.expression, () => {
      void runJob(job.id, undefined, {
        trigger: "in_process",
        triggerId: `schedule.${job.id}`,
        alertSink: options.alertSink,
      }).catch(() => undefined);
    });
  }
  logger.info("Registered in-process jobs", {
    schedulerMode: mode,
    jobs: activeSchedules.map(({ id, expression }) => ({ id, expression })),
    disabledJobs: [...disabledJobIds],
  });
}
