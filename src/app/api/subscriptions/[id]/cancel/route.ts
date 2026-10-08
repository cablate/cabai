import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { cancelSubscription } from "@/lib/portaly";
import { checkoutLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { cancelSubscriptionSchema } from "@/lib/validations/subscription";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { reconcileOrderSubscriptionState } from "@/lib/entitlement-transitions";
import { normalizePortalySubscriptionFields } from "@/lib/subscription-state";

const logger = createLogger("subscriptions/cancel");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "cancel subscription" },
  async (request, context) => {
  // Rate limit — reuse checkout limiter (10 req/60s per IP)
  const ip = getClientIp(request.headers);
  const rl = checkoutLimiter.check(ip);
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

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    // empty body is fine — defaults handled by schema
  }
  const parsed = cancelSubscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await cancelSubscription(id, parsed.data);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const subscriptionFields = data
    ? normalizePortalySubscriptionFields(data)
    : {
        subscriptionStatus: "canceled",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: null,
        nextBillingAt: null,
      };

  // Persist the provider result and any effective entitlement transition
  // atomically. A period-end cancellation keeps access until its effective
  // date; an immediate cancellation queues durable webhook/Discord cleanup.
  await reconcileOrderSubscriptionState({
    orderId: order.id,
    triggeredBy: `subscription.cancel:${session.user.id}`,
    orderChanges: subscriptionFields,
  });

  return NextResponse.json({ data });
  },
);

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlePost(request, context);
}
