import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDiscordLinks } from "@/lib/db/schema";
import {
  addUserToGuild,
  removeMappedDiscordRoles,
  syncDiscordRolesForUser,
} from "@/lib/discord";
import { enqueueDiscordRoleSyncForUser } from "@/lib/entitlement-transitions";
import { createLogger } from "@/lib/logger";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { getAppBaseUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/event-tracking";

// F-19: timing-safe compare for the OAuth state cookie. State is 32
// bytes of `crypto.randomBytes`, so a timing side-channel is not a
// realistic attack here, but the project standard is `timingSafeEqual`
// for any secret/nonce comparison. Keep all such comparisons uniform
// so future refactors don't accidentally reintroduce string `!==`.
function safeStateEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const logger = createLogger("discord-oauth");

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "";
const SITE_URL = getAppBaseUrl();

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = generalApiLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", SITE_URL));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    logger.warn("Discord OAuth denied", { error });
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=cancelled", SITE_URL),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=error", SITE_URL),
    );
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("discord_oauth_state")?.value;
  cookieStore.delete("discord_oauth_state");

  if (!savedState || !safeStateEqual(savedState, state)) {
    logger.warn("Discord OAuth state mismatch");
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=error", SITE_URL),
    );
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!tokenRes.ok) {
      logger.error("Token exchange failed", { status: tokenRes.status });
      return NextResponse.redirect(
        new URL("/dashboard/profile?discord=error", SITE_URL),
      );
    }

    const tokenData = await tokenRes.json();
    const oauthAccessToken: string = tokenData.access_token;

    // Get Discord user info
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${oauthAccessToken}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!userRes.ok) {
      logger.error("Failed to get Discord user", { status: userRes.status });
      return NextResponse.redirect(
        new URL("/dashboard/profile?discord=error", SITE_URL),
      );
    }

    const discordUser = await userRes.json();
    const discordId: string = discordUser.id;
    const discordUsername: string =
      discordUser.global_name || discordUser.username;

    // Check if this Discord account is already linked to another user
    const existingLink = await db.query.userDiscordLinks.findFirst({
      where: eq(userDiscordLinks.discordId, discordId),
    });

    if (existingLink && existingLink.userId !== session.user.id) {
      logger.warn("Discord account already linked to another user", {
        discordId,
        existingUserId: existingLink.userId,
      });
      return NextResponse.redirect(
        new URL("/dashboard/profile?discord=already_linked", SITE_URL),
      );
    }

    // Upsert discord link
    const userLink = await db.query.userDiscordLinks.findFirst({
      where: eq(userDiscordLinks.userId, session.user.id),
    });

    if (userLink && userLink.discordId !== discordId && !userLink.unlinkedAt) {
      const cleanup = await removeMappedDiscordRoles(userLink.discordId);
      if (!cleanup.ok) {
        logger.error("Failed to clean roles from previous Discord account", {
          userId: session.user.id,
          statuses: cleanup.failures.map((failure) => failure.status),
        });
        return NextResponse.redirect(
          new URL("/dashboard/profile?discord=relink_cleanup_failed", SITE_URL),
        );
      }
    }

    const linkedAt = new Date();
    let persistedLinkId: string | undefined;
    if (userLink) {
      // Update existing link (re-link or refresh)
      const [updated] = await db
        .update(userDiscordLinks)
        .set({ discordId, discordUsername, linkedAt, unlinkedAt: null })
        .where(eq(userDiscordLinks.id, userLink.id))
        .returning({ id: userDiscordLinks.id });
      persistedLinkId = updated?.id;
    } else {
      const [created] = await db
        .insert(userDiscordLinks)
        .values({
          userId: session.user.id,
          discordId,
          discordUsername,
          linkedAt,
        })
        .returning({ id: userDiscordLinks.id });
      persistedLinkId = created?.id;
    }
    if (!persistedLinkId) throw new Error("Unable to persist Discord link.");

    await enqueueDiscordRoleSyncForUser({
      userId: session.user.id,
      triggeredBy: `discord.link:${persistedLinkId}:${linkedAt.toISOString()}`,
    });

    logger.info("Discord account linked", {
      userId: session.user.id,
      discordId,
      discordUsername,
    });

    // Track completion without copying Discord identifiers into analytics.
    recordEvent({
      userId: session.user.id,
      eventType: "discord_link_completed",
      properties: {},
      source: "server",
    }).catch(() => {});

    // Add user to Discord guild (guilds.join) before granting roles
    const joined = await addUserToGuild(discordId, oauthAccessToken);
    if (!joined) {
      logger.error("Failed to add user to Discord guild", {
        discordId,
        userId: session.user.id,
      });
    }

    // Reconcile both missing and stale roles. Mapped-plan work is also queued
    // durably above, so a transient Discord failure is retried by the job.
    const roleSync = await syncDiscordRolesForUser(session.user.id);
    if (!roleSync.ok) {
      logger.error("Failed to grant pending Discord roles", {
        userId: session.user.id,
        statuses: roleSync.failures.map((failure) => failure.status),
      });
    }

    return NextResponse.redirect(
      new URL(
        joined && roleSync.ok
          ? "/dashboard/profile?discord=linked"
          : "/dashboard/profile?discord=linked_pending",
        SITE_URL,
      ),
    );
  } catch (err) {
    logger.error("Discord OAuth flow failed", { error: String(err) });
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=error", SITE_URL),
    );
  }
}
