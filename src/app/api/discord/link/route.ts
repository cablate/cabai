import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { getAppBaseUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/event-tracking";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "";
const SITE_URL = getAppBaseUrl();

export async function GET() {
  const h = await headers();
  const ip = getClientIp(h);
  const rl = generalApiLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", SITE_URL));
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return NextResponse.redirect(
      new URL("/dashboard/profile?discord=not_configured", SITE_URL),
    );
  }

  // Generate state token for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.join",
    state,
  });

  recordEvent({
    userId: session.user.id,
    eventType: "discord_link_started",
    properties: {},
    source: "server",
  }).catch(() => {});

  return NextResponse.redirect(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`,
  );
}
