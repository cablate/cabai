import { NextResponse } from "next/server";
import { runJob } from "@/lib/jobs/runner";
import { assertCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("cron-process-webhooks");

/**
 * GET /api/cron/process-webhooks
 *
 * Durable webhook outbox processor. This route is designed for Vercel Cron or
 * an external scheduler. It processes a bounded batch and exits; the database
 * stores retry timing and dead-letter state.
 */
export const POST = withApiHandler(
  { logger, operation: "process webhooks", internalError: "Webhook processing failed" },
  async (request) => {
  // F-16: state-changing handler uses POST.
  const reject = assertCronAuth(request);
  if (reject) return reject;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const run = await runJob("webhook-outbox", { limit }, {
      trigger: "external_cron",
      triggerId: "cron.process-webhooks",
    });
    return NextResponse.json({ executed: run.executed, ...(run.result as object | undefined) });
  } catch (error) {
    logger.error("Webhook processing failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
  },
);
