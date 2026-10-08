import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { inspectPlatformConfig } from "@/lib/config/platform";
import { inspectJobFreshness } from "@/lib/jobs/freshness";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { inspectProviderSyncQueue, providerSyncHealthStatus } from "@/lib/provider-sync-ledger";
import { inspectSchemaReadiness } from "@/lib/schema-readiness";

const logger = createLogger("health-detailed");

export const dynamic = "force-dynamic";

/**
 * GET /api/health/detailed — authenticated operational readiness probe.
 *
 * The default response is non-2xx for fatal or degraded operations so an
 * external monitor can alert. The container uses `?scope=core`: optional
 * degradation stays visible in the JSON payload but does not remove a working
 * course-delivery process from service. Database/schema failure is always 503.
 */
export const GET = withApiHandler(
  { logger, operation: "check detailed health" },
  async (request) => {
    const reject = assertCronAuth(request);
    if (reject) return reject;

    const start = Date.now();
    const coreScope = new URL(request.url).searchParams.get("scope") === "core";

    try {
      const inspection = inspectPlatformConfig();
      const schema = await inspectSchemaReadiness();
      const schedulerEnabled = inspection.capabilities.scheduledTasks.state === "enabled";
      const jobs = schema.current
        ? await inspectJobFreshness({
            schedulerEnabled,
            backupEnabled: inspection.capabilities.backup.state === "enabled",
          })
        : [];
      const providerSyncQueue = schema.current ? await inspectProviderSyncQueue() : null;
      const providerSyncQueueStatus = providerSyncQueue
        ? providerSyncHealthStatus(providerSyncQueue)
        : "not_checked";
      const fatalKeys = inspection.diagnostics
        .filter((diagnostic) => diagnostic.impact === "fatal")
        .map((diagnostic) => diagnostic.key);
      const degradedKeys = inspection.diagnostics
        .filter((diagnostic) => diagnostic.impact === "degraded")
        .map((diagnostic) => diagnostic.key);
      const staleJobs = jobs.filter((job) => job.state === "stale" || job.state === "failed");
      const coreFailure = !schema.current || fatalKeys.length > 0;
      const providerSyncDegradedKeys = providerSyncQueue?.expiredLeaseCount
        ? ["provider_sync_expired_lease"]
        : providerSyncQueue && providerSyncQueueStatus === "degraded"
          ? ["provider_sync_queue_stale"]
          : [];
      const operationalDegraded = degradedKeys.length > 0 || staleJobs.length > 0 || providerSyncQueueStatus === "degraded";
      const status = coreFailure ? "error" : operationalDegraded ? "degraded" : "ok";
      const httpStatus = coreFailure || (operationalDegraded && !coreScope) ? 503 : 200;

      return NextResponse.json({
        status,
        db: schema.code === "SCHEMA_LEDGER_UNAVAILABLE" ? "unavailable" : "connected",
        dbLatencyMs: Date.now() - start,
        schema: {
          status: schema.current ? "current" : "stale",
          code: schema.code,
          requiredTag: schema.requiredTag,
        },
        config: {
          status: fatalKeys.length > 0 ? "error" : degradedKeys.length > 0 ? "degraded" : "ok",
          fatal: fatalKeys,
          degraded: degradedKeys,
        },
        scheduler: {
          mode: inspection.capabilities.scheduledTasks.provider ?? "disabled",
          jobs,
        },
        operational: {
          status: operationalDegraded ? "degraded" : "ok",
          degraded: [...degradedKeys, ...staleJobs.map((job) => job.jobId), ...providerSyncDegradedKeys],
        },
        providerSyncQueue: {
          status: providerSyncQueueStatus,
          ...(providerSyncQueue ?? {}),
        },
        timestamp: new Date().toISOString(),
      }, { status: httpStatus });
    } catch {
      logger.error("Detailed health check failed", { code: "READINESS_QUERY_FAILED" });
      return NextResponse.json(
        {
          status: "error",
          db: "unavailable",
          code: "READINESS_QUERY_FAILED",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
  },
);
