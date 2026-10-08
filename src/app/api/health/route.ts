import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";

const logger = createLogger("health");

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public liveness probe.
 *
 * Intentionally returns only `{status:"ok"}` and never probes the database
 * or other internal state. Exposing DB connectivity, latency, deploy
 * timestamps, or build hashes to unauthenticated callers helps attackers
 * fingerprint outages and deploy windows.
 *
 * For DB readiness and latency, use /api/health/detailed (CRON_SECRET-gated).
 */
export const GET = withApiHandler(
  { logger, operation: "check health" },
  async () => NextResponse.json({ status: "ok" }),
);
