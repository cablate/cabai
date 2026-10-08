import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { resumeSubscription } from "@/lib/portaly";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { reconcileOrderSubscriptionState } from "@/lib/entitlement-transitions";
import { normalizePortalySubscriptionFields } from "@/lib/subscription-state";

const logger = createLogger("subscriptions/resume");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "resume subscription" },
  async (request, context) => {
  const ip = getClientIp(request.headers);
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

  const { id } = await context!.params;

  // Ownership check: verify subscription belongs to this user
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.subscriptionId, id), eq(orders.userId, session.user.id)),
  });
  if (!order) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (order.status === "refunded" || order.refundedAt) {
    return NextResponse.json(
      { error: "Refunded subscriptions cannot be resumed" },
      { status: 409 },
    );
  }

  const { data, error } = await resumeSubscription(id);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const subscriptionFields = data ? normalizePortalySubscriptionFields(data) : null;

  // Restore only subscription-lifecycle revocations. Explicit refunds or
  // manual revocations remain fail-closed even if a provider response says
  // active.
  await reconcileOrderSubscriptionState({
    orderId: order.id,
    triggeredBy: `subscription.resume:${session.user.id}`,
    orderChanges: {
      status: "completed",
      subscriptionStatus: subscriptionFields?.subscriptionStatus ?? "active",
      cancelAtPeriodEnd: false,
      cancelEffectiveAt: null,
      nextBillingAt: subscriptionFields?.nextBillingAt ?? order.nextBillingAt,
    },
  });

  return NextResponse.json({ data });
  },
);

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlePost(request, context);
}
