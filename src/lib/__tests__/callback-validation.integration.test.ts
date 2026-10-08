/**
 * A4/A5: Callback Amount & Currency Validation
 *
 * Tests that the callback route rejects order completion when
 * the paid amount or currency doesn't match the plan.
 *
 * Real DB, mocks: Portaly signature, rate-limit, Discord.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createTestUser, createTestPlan, createTestOrder, cleanTestData } from "@/test/helpers";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
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
