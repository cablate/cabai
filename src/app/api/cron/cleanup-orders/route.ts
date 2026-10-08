import { NextResponse } from "next/server";
import { runJob } from "@/lib/jobs/runner";
import { assertCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("cron-cleanup-orders");

/**
 * GET /api/cron/cleanup-orders
 *
 * Expires stale pending orders older than 24 hours.
 * Checkout sessions that were never completed should not stay pending forever.
 *
 * Protected by CRON_SECRET env var.
 */
export const POST = withApiHandler(
  { logger, operation: "cleanup orders", internalError: "Cleanup failed" },
  async (request) => {
  // F-16: state-changing handler uses POST.
  const reject = assertCronAuth(request);
  if (reject) return reject;

  try {
    const run = await runJob("cleanup-orders", undefined, {
      trigger: "external_cron",
      triggerId: "cron.cleanup-orders",
    });
    return NextResponse.json({ ok: true, executed: run.executed, ...(run.result as object | undefined) });
  } catch (err) {
    logger.error("Cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 },
    );
  }
  },
);
