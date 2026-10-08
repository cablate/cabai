import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, plans, orders, userPurchases } from "@/lib/db/schema";
import { verifyServiceKey } from "@/lib/webhook-verify";
import { checkPlanAccess } from "@/lib/access";
import { entitlementLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { normalizeEmail } from "@/lib/email-normalize";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";

const logger = createLogger("entitlements/check");

/**
 * GET /api/entitlements/check?email={email}&plan_id={planId}
 *
 * External services call this to verify a single user's entitlement.
 * Authenticated via x-service-key header (SHA-256 + prefix lookup).
 */
export const GET = withApiHandler(
  { logger, operation: "check entitlement" },
  async (request) => {
  const ip = getClientIp(request.headers);
  const rl = entitlementLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const planId = url.searchParams.get("plan_id");
  const serviceKey = request.headers.get("x-service-key");

  if (!email || !planId) {
    return NextResponse.json(
      { error: "Missing email or plan_id query parameter" },
      { status: 400 },
    );
  }

  if (!serviceKey) {
    return NextResponse.json(
      { error: "Missing x-service-key header" },
      { status: 401 },
    );
  }

  // Verify service key — must match a config for this plan
  const config = await verifyServiceKey(serviceKey, planId);
  if (!config) {
    return NextResponse.json(
      { error: "Invalid service key or plan mismatch" },
      { status: 403 },
    );
  }

  // F-09: case-insensitive + Gmail-alias-collapsed lookup. Without
  // this, a caller passing `A@Gmail.com` or `a.dot+tag@gmail.com`
  // misses a user stored as `a@gmail.com` even though they're the
  // same identity to Google.
  const normalized = normalizeEmail(email);
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalized} OR lower(${users.email}) = ${email.trim().toLowerCase()}`,
  });

  // Resolve plan name (used for both denial paths and the success path,
  // so look it up once).
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });
  const planName = plan?.name ?? null;

  // F-18: collapse the previous "no_account" vs "expired" distinction
  // into a single "inactive" response. Returning different status codes
  // for "email not registered" vs "registered but no access" lets a
  // service-key holder enumerate which emails own accounts on this
  // platform. Both denials now look identical to the caller — the only
  // difference is the plan_name field, which is public information.
  if (!user) {
    return NextResponse.json({
      has_access: false,
      source: null,
      status: "inactive",
      expires_at: null,
      cancel_at_period_end: false,
      plan_name: planName,
    });
  }

  // Check entitlement using existing access logic
  const result = await checkPlanAccess(user.id, planId, email);

  if (!result.hasAccess) {
    return NextResponse.json({
      has_access: false,
      source: null,
      status: "inactive",
      expires_at: null,
      cancel_at_period_end: false,
      plan_name: planName,
    });
  }

  // Resolve purchase details (expiresAt, subscription state)
  let expiresAt: string | null = null;
  let cancelAtPeriodEnd = false;
  let status = "active";

  const purchase = await db.query.userPurchases.findFirst({
    where: and(
      eq(userPurchases.userId, user.id),
      eq(userPurchases.planId, planId),
    ),
  });

  if (purchase) {
    expiresAt = purchase.expiresAt?.toISOString() ?? null;

    // If purchase is payment-based with an order, check subscription state
    if (purchase.orderId) {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, purchase.orderId),
      });
      if (order) {
        cancelAtPeriodEnd = !!order.cancelAtPeriodEnd;
        if (order.subscriptionStatus === "past_due") {
          status = "past_due";
        }
        if (cancelAtPeriodEnd) {
          status = "expiring";
        }
      }
    }
  }

  return NextResponse.json({
    has_access: true,
    source: result.source,
    status,
    expires_at: expiresAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    plan_name: planName,
  });
  },
);
