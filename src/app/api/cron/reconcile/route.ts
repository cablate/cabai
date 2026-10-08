import { NextResponse } from "next/server";
import { runJob } from "@/lib/jobs/runner";
import { assertCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("cron-reconcile");

/**
 * GET /api/cron/reconcile
 *
 * Subscription reconciliation cron endpoint.
 * Callable by:
 * - Vercel Cron (add to vercel.json: { "path": "/api/cron/reconcile", "schedule": "0 6,18 * * *" })
 * - External cron (curl with CRON_SECRET header)
 * - Admin manual trigger
 *
 * Protected by CRON_SECRET env var to prevent unauthorized access.
 */
export const POST = withApiHandler(
  { logger, operation: "reconcile subscriptions", internalError: "Reconciliation failed" },
  async (request) => {
  // F-16: state-changing handler uses POST. GET should be safe and
  // idempotent per HTTP semantics; reconciliation writes to orders +
  // userPurchases + Discord + outbound webhooks. External cron runners
  // need to be updated to POST the same path (Authorization header
  // unchanged).
  const reject = assertCronAuth(request);
  if (reject) return reject;

  try {
    const run = await runJob("subscription-reconciliation", undefined, {
      trigger: "external_cron",
      triggerId: "cron.reconcile",
    });
    return NextResponse.json({ ok: true, executed: run.executed, ...(run.result as object | undefined) });
  } catch (err) {
    logger.error("Reconciliation failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 },
    );
  }
  },
);
