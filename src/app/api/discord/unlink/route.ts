import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDiscordLinks } from "@/lib/db/schema";
import { removeMappedDiscordRoles } from "@/lib/discord";
import { createLogger } from "@/lib/logger";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { getAppBaseUrl } from "@/lib/app-url";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { recordEvent } from "@/lib/event-tracking";

const logger = createLogger("discord-unlink");

const SITE_URL = getAppBaseUrl();

export async function POST(request: Request) {
  const h = await headers();
  const ip = getClientIp(h);
  const rl = generalApiLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);
  try {
    assertSameOriginRequest(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const link = await db.query.userDiscordLinks.findFirst({
    where: and(
      eq(userDiscordLinks.userId, session.user.id),
      isNull(userDiscordLinks.unlinkedAt),
    ),
  });

  if (!link) {
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=not_linked", SITE_URL),
    );
  }

  // Do not sever the local link until every plan-managed role is absent.
  // Otherwise future durable reconciliation would skip this account forever.
  const cleanup = await removeMappedDiscordRoles(link.discordId);
  if (!cleanup.ok) {
    logger.error("Failed to revoke Discord roles on unlink", {
      userId: session.user.id,
      failures: cleanup.failures.map((failure) => failure.status),
    });
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=unlink_error", SITE_URL),
    );
  }

  // Track discord unlinked (fire-and-forget)
  recordEvent({
    userId: session.user.id,
    eventType: "discord_unlinked",
    properties: { discordId: link.discordId, discordUsername: link.discordUsername },
    source: "server",
  }).catch(() => {});

  // Soft-delete: mark as unlinked instead of deleting, so we preserve history
  await db
    .update(userDiscordLinks)
    .set({ unlinkedAt: new Date() })
    .where(eq(userDiscordLinks.id, link.id));

  logger.info("Discord account unlinked", {
    userId: session.user.id,
    discordId: link.discordId,
  });

  return NextResponse.redirect(
    new URL("/dashboard/profile?discord=unlinked", SITE_URL),
  );
}
