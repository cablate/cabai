/**
 * A4/A5: Callback Amount & Currency Validation
 *
 * Tests that the callback route rejects order completion when
 * the paid amount or currency doesn't match the plan.
 *
 * Real DB, mocks: Portaly signature, rate-limit, Discord.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createTestUser, createTestPlan, createTestOrder, createTestPurchase, cleanTestData } from "@/test/helpers";
import { db } from "@/lib/db";
import { orders, userPurchases, entitlementOutbox } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ─── Mocks (external services + rate-limit) ───

vi.mock("@/lib/portaly", () => ({
  verifyCallback: vi.fn().mockReturnValue(true),
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  PORTALY_MODE: "test",
}));

vi.mock("@/lib/rate-limit", () => ({
  callbackLimiter: { check: () => ({ success: true }) },
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/rate-limit-response", () => ({
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/discord", () => ({
  grantDiscordRolesForPlan: vi.fn().mockResolvedValue(undefined),
  revokeDiscordRolesForPlan: vi.fn().mockResolvedValue(undefined),
}));

// Import route handler AFTER mocks are set up
import { POST } from "@/app/api/callback/route";
import { revokeOrderEntitlement } from "@/lib/entitlement-transitions";

// ─── Helpers ───

function callbackRequest(
  body: Record<string, unknown>,
  event = "checkout.completed",
): Request {
  const payload = {
    event,
    status: "completed",
    mode: "test",
    ...body,
  };

  return new Request("http://localhost:3002/api/callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portaly-timestamp": String(Date.now()),
      "x-portaly-signature": "mock-sig",
      "x-portaly-event": event,
    },
    body: JSON.stringify(payload),
  });
}

// ─── Setup ───

let userId: string;
let fixedPlanId: string;
let dynamicPlanId: string;

beforeAll(async () => {
  await cleanTestData();

  const user = await createTestUser({ email: "test-cb-validation@example.com" });
  userId = user.id;

  const fixedPlan = await createTestPlan({
    name: "Fixed Plan",
    billingPeriod: "one-time",
    amount: 9900,
    currency: "TWD",
    pricingType: "fixed",
  });
  fixedPlanId = fixedPlan.id;

  const dynamicPlan = await createTestPlan({
    name: "Dynamic Plan",
    amount: 9900,
    currency: "TWD",
    pricingType: "dynamic",
  });
  dynamicPlanId = dynamicPlan.id;
});

afterAll(async () => {
  await cleanTestData();
});

// The production invariant permits one pending checkout per user/plan. Tests
// that intentionally leave a rejected callback pending must close that fixture
// before the next case creates another order for the same pair.
afterEach(async () => {
  await db.update(orders).set({ status: "failed", updatedAt: new Date() }).where(eq(orders.status, "pending"));
});

// ─── A4: Amount mismatch ───

describe("A4: Callback amount validation", () => {
  it("rejects when paid amount doesn't match fixed plan amount", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 5000, // plan.amount = 9900
        currency: "TWD",
      }),
    );

    // Always 200 to payment provider
    expect(res.status).toBe(200);

    // Order must stay pending — completeOrder was NOT called
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });

  it("passes dynamic pricing when paid amount matches order expected amount", async () => {
    const order = await createTestOrder(userId, dynamicPlanId, {
      expectedAmount: 5000,
      expectedCurrency: "TWD",
    });

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 5000,
        currency: "TWD",
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
  });

  it("rejects dynamic pricing when paid amount differs from order expected amount", async () => {
    const order = await createTestOrder(userId, dynamicPlanId, {
      expectedAmount: 5000,
      expectedCurrency: "TWD",
    });

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 4000,
        currency: "TWD",
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });

  it("passes when paid amount matches plan amount → order completes", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 9900,
        currency: "TWD",
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
  });

  it("passes when customerEmail differs from the local order owner", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 9900,
        currency: "TWD",
        customerEmail: "payer-different@example.com",
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
  });

  it("rejects when callback status is not completed", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 9900,
        currency: "TWD",
        status: "failed",
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });
});

// ─── A5: Currency mismatch ───

describe("A5: Callback currency validation", () => {
  it("rejects when currency doesn't match plan currency", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 9900, // amount matches
        currency: "USD", // plan.currency = TWD
      }),
    );

    expect(res.status).toBe(200);

    // Order must stay pending
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });

  it("rejects when callback has no currency field", async () => {
    const order = await createTestOrder(userId, fixedPlanId);

    const res = await POST(
      callbackRequest({
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 9900,
        // no currency field → paidCurrency is undefined → skip currency check
      }),
    );

    expect(res.status).toBe(200);

    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });
});

describe("Payment one-time refund outcomes", () => {
  async function refundFixture(status: "completed" | "pending" = "completed") {
    const order = await createTestOrder(userId, fixedPlanId, { status, paidAmount: status === "completed" ? 9900 : null, expectedAmount: 9900, portalySessionId: `refund-session-${crypto.randomUUID()}` });
    await db.update(orders).set({ providerMode: "test" }).where(eq(orders.id, order.id));
    return { order, payload: { mode: "test", orderId: `provider-${order.id}`, paymentId: `payment-${order.id}`, orderMerchantOrderNumber: order.merchantOrderNumber, amount: 9900, refundedAmount: 9900, currency: "TWD", refundedAt: "2026-10-09T00:00:00.000Z" } };
  }

  it("refunds only the matched order and deduplicates its outbox on replay", async () => {
    const { order, payload } = await refundFixture();
    const purchase = await createTestPurchase(userId, fixedPlanId, order.id);
    const otherOrder = await createTestOrder(userId, fixedPlanId, { status: "completed", paidAmount: 9900 });
    const otherPurchase = await createTestPurchase(userId, fixedPlanId, otherOrder.id);
    for (let i = 0; i < 2; i++) {
      expect((await POST(callbackRequest(payload, "creator_subscription.payment.refunded"))).status).toBe(200);
    }
    const stored = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(stored?.status).toBe("refunded");
    expect(stored?.refundAmount).toBe(9900);
    expect((await db.query.userPurchases.findFirst({ where: eq(userPurchases.id, purchase.id) }))?.revokedAt).not.toBeNull();
    expect((await db.query.userPurchases.findFirst({ where: eq(userPurchases.id, otherPurchase.id) }))?.revokedAt).toBeNull();
    const outbox = await db.select().from(entitlementOutbox).where(eq(entitlementOutbox.orderId, order.id));
    expect(outbox.filter(row => row.eventType === "entitlement.revoked")).toHaveLength(1);
  });

  it("keeps an early refund terminal when checkout completion arrives later", async () => {
    const { order, payload } = await refundFixture("pending");
    expect((await POST(callbackRequest(payload, "creator_subscription.payment.refunded"))).status).toBe(200);
    expect((await POST(callbackRequest({ merchantOrderNumber: order.merchantOrderNumber, amount: 9900, currency: "TWD", planId: fixedPlanId }))).status).toBe(200);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("refunded");
    expect(await db.select().from(userPurchases).where(eq(userPurchases.orderId, order.id))).toHaveLength(0);
    expect(await db.select().from(entitlementOutbox).where(eq(entitlementOutbox.orderId, order.id))).toHaveLength(1);
  });

  it("keeps refund terminal against a concurrent cancellation and its stale retry", async () => {
    const { order, payload } = await refundFixture();
    await createTestPurchase(userId, fixedPlanId, order.id);
    const cancel = () => revokeOrderEntitlement({ orderId: order.id, source: "payment", triggeredBy: "test.cancel", revokedBy: "test", orderChanges: { status: "canceled" } });
    const [response] = await Promise.all([
      POST(callbackRequest(payload, "creator_subscription.payment.refunded")), cancel(),
    ]);
    expect(response.status).toBe(200);
    await cancel();
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("refunded");
    const outbox = await db.select().from(entitlementOutbox).where(eq(entitlementOutbox.orderId, order.id));
    expect(outbox.filter(row => row.eventType === "entitlement.revoked")).toHaveLength(1);
  });
});
