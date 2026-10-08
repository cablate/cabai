import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordActivity } from "@/lib/services/activity-tracking-service";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { parseTrackEvent } from "@/lib/track-event-contract";

const logger = createLogger("track");

export const POST = withApiHandler(
  { logger, operation: "track event" },
  async (request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = parseTrackEvent(body);
  if (!parsed) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await recordActivity({
      userId: session.user.id,
      eventType: parsed.event,
      properties: parsed.properties,
      source: "web",
    });
  } catch (err) {
    logger.error("Failed to track event", {
      error: String(err),
      userId: session.user.id,
      event: parsed.event,
    });
  }

  return NextResponse.json({ ok: true });
  },
);
