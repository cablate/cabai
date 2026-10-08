import { NextResponse } from "next/server";
import { eq, and, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { createPortalSession } from "@/lib/portaly";
import { portalSchema } from "@/lib/validations/portal";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { appUrl } from "@/lib/app-url";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("portal");

export const POST = withApiHandler(
  { logger, operation: "create portal session", internalError: "Portal session unavailable. Please try again." },
  async (request) => {
  try {
    assertSameOriginRequest(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F-49: top-level try/catch so any unexpected throw (Portaly network
  // error, schema bug, etc.) becomes a JSON 500 instead of Next.js's
  // default text-only 500 with a leaked stack frame.
  try {
    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      // empty body is fine — defaults handled by schema
    }
    const parsed = portalSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const body = parsed.data;

    // If subscriptionId is provided, verify it belongs to the logged-in user
    if (body.subscriptionId) {
      const ownerOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.subscriptionId, body.subscriptionId),
          eq(orders.userId, session.user.id),
        ),
      });
      if (!ownerOrder) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 403 });
      }
    } else {
      // F-49: customerEmail-only path used to forward unconditionally
      // to Portaly. If the user had never completed a Portaly checkout
      // (signup-only / manual grant only), Portaly would return an
      // ambiguous error and we'd surface it as a 500 with no JSON body.
      // Pre-check locally: the user must have at least one completed
      // order with a Portaly session ID. Otherwise return a JSON 404 so
      // the UI can render a helpful "no subscription on file" state.
      const portalyOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.userId, session.user.id),
          eq(orders.status, "completed"),
          isNotNull(orders.portalySessionId),
        ),
        columns: { id: true },
      });
      if (!portalyOrder) {
        return NextResponse.json(
          { error: "No Portaly subscription on file" },
          { status: 404 },
        );
      }
    }

    const result = await createPortalSession({
      ...(body.subscriptionId
        ? { subscriptionId: body.subscriptionId }
        : { customerEmail: session.user.email }),
      returnUrl: appUrl("/dashboard"),
    });

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error ?? "Portal session unavailable" }, { status: 400 });
    }

    return NextResponse.json({ portalUrl: result.data.portalUrl });
  } catch (err) {
    logger.error("Portal session creation failed", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Portal session unavailable. Please try again." },
      { status: 500 },
    );
  }
  },
);
