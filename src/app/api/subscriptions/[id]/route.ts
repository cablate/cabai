import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSubscription } from "@/lib/portaly";
import { generalApiLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";

const logger = createLogger("subscriptions/get");

const handleGet = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "get subscription" },
  async (request, context) => {
  const ip = getClientIp(request.headers);
  const rl = generalApiLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

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

  const { data, error } = await getSubscription(id);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ data });
  },
);

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGet(request, context);
}
