/** Node.js-only startup health checks and optional in-process job scheduling. */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inspectPlatformConfig } from "@/lib/config/platform";
import { scheduleRegisteredJobs } from "@/lib/jobs/scheduler";
import { createLogger } from "@/lib/logger";
import { inspectSchemaReadiness } from "@/lib/schema-readiness";
import { captureOperationalMessage } from "@/lib/observability/capture";

const logger = createLogger("startup");

export async function onStartup(): Promise<void> {
  const inspection = inspectPlatformConfig();
  const blocking = inspection.diagnostics.filter((item) => item.impact === "fatal");
  const degraded = inspection.diagnostics.filter((item) => item.impact === "degraded");
  if (blocking.length > 0) {
    logger.error("Platform configuration is not ready", {
      diagnostics: blocking.map(({ key, message }) => ({ key, message })),
    });
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Startup blocked by invalid configuration: ${blocking.map((item) => item.key).join(", ")}`);
    }
  }
  if (degraded.length > 0) {
    logger.warn("Optional platform capabilities are degraded", {
      diagnostics: degraded.map(({ key }) => ({ key, impact: "degraded" })),
    });
    for (const diagnostic of degraded) {
      captureOperationalMessage("Optional platform capability is degraded", "warning", {
        errorCode: "CAPABILITY_DEGRADED",
        operation: diagnostic.key,
        runtime: "nodejs",
        surface: "startup",
      });
    }
  }

  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    if (!result.rows?.length) throw new Error("Unexpected empty query result");
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'orders', 'plans', 'user_purchases')
      ORDER BY table_name
    `);
    const found = tables.rows.map((row: Record<string, unknown>) => String(row.table_name));
    const missing = ["orders", "plans", "user_purchases", "users"].filter((table) => !found.includes(table));
    if (missing.length) logger.warn("Database schema is not ready", { missingTables: missing });
    else logger.info("Database health check passed", { tables: found.length });
  } catch (error) {
    logger.error("Database health check failed", { error: error instanceof Error ? error.message : String(error) });
    if (process.env.NODE_ENV === "production") throw new Error("Startup blocked: database unreachable");
  }

  const schema = await inspectSchemaReadiness();
  if (!schema.current) {
    logger.error("Database schema is not current", {
      code: schema.code,
      requiredTag: schema.requiredTag,
    });
    if (process.env.NODE_ENV === "production") {
      throw new Error("Startup blocked: database schema is not current");
    }
  }

  if (process.env.NODE_ENV === "production") {
    const schedulerMode = inspection.capabilities.scheduledTasks.state === "enabled"
      ? inspection.capabilities.scheduledTasks.provider as "in_process" | "external"
      : "disabled";
    scheduleRegisteredJobs({
      mode: schedulerMode,
      disabledJobIds: inspection.capabilities.backup.state === "enabled" ? [] : ["database-backup"],
    });
  } else {
    logger.info("In-process jobs are disabled", {
      nodeEnv: process.env.NODE_ENV,
      schedulerMode: inspection.capabilities.scheduledTasks.provider ?? "disabled",
    });
  }
}
