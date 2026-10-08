import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { syncDiscordRolesForUser } from "@/lib/discord";
import { enqueueDiscordRoleSyncForUser } from "@/lib/entitlement-transitions";
import { createLogger } from "@/lib/logger";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("discord-refresh");

/**
 * POST /api/discord/refresh-roles
 *
 * Re-grant Discord roles for the current user's active entitlements.
 * Used when a user joins the Discord server manually after linking their
 * Discord account, or when they believe their roles are out of sync.
 */
export const POST = withApiHandler(
  { logger, operation: "refresh Discord roles" },
  async (request) => {
  try {
    assertSameOriginRequest(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const h = await headers();
  const ip = getClientIp(h);
  const rl = generalApiLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enqueueDiscordRoleSyncForUser({
      userId: session.user.id,
      triggeredBy: `discord.refresh:${Date.now()}`,
    });
    const result = await syncDiscordRolesForUser(session.user.id);
    if (result.skipped === "unlinked") {
      return NextResponse.json({ ok: false, error: "尚未連結 Discord" }, { status: 400 });
    }
    if (result.skipped === "disabled") {
      return NextResponse.json({ ok: false, error: "Discord 整合尚未啟用" }, { status: 503 });
    }
    if (!result.ok) {
      logger.warn("Discord role refresh queued for retry", {
        userId: session.user.id,
        statuses: result.failures.map((failure) => failure.status),
      });
      return NextResponse.json({ ok: false, pending: true }, { status: 202 });
    }
    logger.info("Discord roles refreshed", { userId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("Failed to refresh Discord roles", {
      error: String(err),
      userId: session.user.id,
    });
    return NextResponse.json(
      { ok: false, error: "角色同步失敗，請稍後再試" },
      { status: 500 },
    );
  }
  },
);
