import { NextResponse } from "next/server";
import { eq, and, isNull, or, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPurchases, users, orders } from "@/lib/db/schema";
import { verifyServiceKey } from "@/lib/webhook-verify";
import { entitlementLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { localPaymentOrderGrantsAccess } from "@/lib/access";

const logger = createLogger("entitlements/list");

/**
 * GET /api/entitlements/list?plan_id={planId}&status=active
 *
 * External services call this for daily reconciliation — returns all users
 * with active entitlements for a given plan.
 * Authenticated via x-service-key header.
 */
export const GET = withApiHandler(
  { logger, operation: "list entitlements" },
  async (request) => {
  const ip = getClientIp(request.headers);
  const rl = entitlementLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  const url = new URL(request.url);
  const planId = url.searchParams.get("plan_id");
  const serviceKey = request.headers.get("x-service-key");

  if (!planId) {
    return NextResponse.json(
      { error: "Missing plan_id query parameter" },
      { status: 400 },
    );
  }

  if (!serviceKey) {
    return NextResponse.json(
      { error: "Missing x-service-key header" },
      { status: 401 },
    );
  }

  // Verify service key
  const config = await verifyServiceKey(serviceKey, planId);
  if (!config) {
    return NextResponse.json(
      { error: "Invalid service key or plan mismatch" },
      { status: 403 },
    );
  }

  // Find all active entitlements for this plan
  const now = new Date();
  const purchases = await db
    .select({
      userId: userPurchases.userId,
      grantedAt: userPurchases.grantedAt,
      expiresAt: userPurchases.expiresAt,
      grantedBy: userPurchases.grantedBy,
      orderId: userPurchases.orderId,
    })
    .from(userPurchases)
    .where(
      and(
        eq(userPurchases.planId, planId),
        // Not revoked
        isNull(userPurchases.revokedAt),
        // Not expired: either no expiresAt or expiresAt in the future
        or(isNull(userPurchases.expiresAt), gte(userPurchases.expiresAt, now)),
      ),
    );

  // Batch-load users and orders to avoid N+1 queries
  const userIds = [...new Set(purchases.map((p) => p.userId))];
  const orderIds = purchases.map((p) => p.orderId).filter((id): id is string => !!id);

  const [userRows, orderRows] = await Promise.all([
    userIds.length > 0
      ? db.select({ id: users.id, email: users.email, name: users.name })
          .from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
    orderIds.length > 0
      ? db.select({
          id: orders.id, status: orders.status, subscriptionId: orders.subscriptionId,
          subscriptionStatus: orders.subscriptionStatus, cancelAtPeriodEnd: orders.cancelAtPeriodEnd,
          cancelEffectiveAt: orders.cancelEffectiveAt, nextBillingAt: orders.nextBillingAt,
          createdAt: orders.createdAt,
        }).from(orders).where(inArray(orders.id, orderIds))
      : Promise.resolve([]),
  ]);

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));

  const activeEntitlements: Array<{
    email: string;
    name: string | null;
    status: string;
    granted_at: string;
    expires_at: string | null;
    source: string;
  }> = [];

  for (const purchase of purchases) {
    const user = userMap.get(purchase.userId);
    if (!user?.email) continue;

    let status = "active";
    let source =
      purchase.grantedBy === "manual"
        ? "manual"
        : purchase.grantedBy === "free_claim"
          ? "free_claim"
          : "one-time";

    if (purchase.orderId && purchase.grantedBy === "payment") {
      const order = orderMap.get(purchase.orderId);
      if (!order || !localPaymentOrderGrantsAccess(order, purchase.expiresAt, now)) continue;

      // F-01: subscriptionStatus, not legacy subscriptionId truthiness, is
      // the classification boundary shared with content and Discord access.
      if (order.subscriptionStatus) {
        source = "subscription";
        if (order.cancelAtPeriodEnd || order.subscriptionStatus === "canceled") {
          status = "expiring";
        }
      }
    }

    activeEntitlements.push({
      email: user.email,
      name: user.name,
      status,
      granted_at: purchase.grantedAt?.toISOString() ?? new Date().toISOString(),
      expires_at: purchase.expiresAt?.toISOString() ?? null,
      source,
    });
  }

  return NextResponse.json({
    entitlements: activeEntitlements,
    total: activeEntitlements.length,
  });
  },
);
