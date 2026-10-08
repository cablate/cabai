import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("cron-auth");

/**
 * Verify a `Bearer <CRON_SECRET>` Authorization header in constant time.
 *
 * Returns a NextResponse to forward when the caller is unauthorised, or null
 * when the request is allowed. Callers do:
 *
 *   const reject = assertCronAuth(request);
 *   if (reject) return reject;
 *
 * Used by /api/cron/* and /api/health/detailed.
 */
export function assertCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("CRON_SECRET not set in production — blocking request");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    logger.warn("CRON_SECRET not set — skipping auth in dev mode");
    return null;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);

  if (
    expected.byteLength !== actual.byteLength ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
