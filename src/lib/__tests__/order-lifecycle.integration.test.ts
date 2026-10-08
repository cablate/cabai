/**
 * Phase 1: Order Lifecycle — A1-A5
 * Tests order completion state machine, idempotency, and guards.
 * Real DB, mocks Portaly API (getSubscription).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestUser, createTestPlan, createTestOrder, createTestPurchase, cleanTestData } from "@/test/helpers";
import { completeOrder, ensureUserPurchase } from "@/lib/order-lifecycle";
import { db } from "@/lib/db";
import { entitlementOutbox, orders, userPurchases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock Portaly API (external service)
vi.mock("@/lib/portaly", () => ({
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  PORTALY_MODE: "test",
  verifyCallback: vi.fn(),
}));

let userId: string;
let planId: string;

beforeAll(async () => {
  await cleanTestData();
  const user = await createTestUser({ email: "test-order@example.com" });
  userId = user.id;
  const plan = await createTestPlan({ name: "Order Test Plan" });
  planId = plan.id;
});

afterAll(async () => {
  await cleanTestData();
});

describe("Order Lifecycle / completeOrder (A1-A3)", () => {
  it("A1: pending order → complete → userPurchase granted", async () => {
    const order = await createTestOrder(userId, planId, { status: "pending" });

    const result = await completeOrder(order.id, userId, planId, {
      paidAmount: 9900,
      paymentMethod: "credit_card",
    });

    expect(result.completed).toBe(true);
    expect(result.wasAlreadyCompleted).toBe(false);
    expect(result.purchaseCreated).toBe(true);

    // Verify DB state
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
    expect(dbOrder?.paidAmount).toBe(9900);

    const purchase = await db.query.userPurchases.findFirst({
      where: eq(userPurchases.orderId, order.id),
    });
    expect(purchase).toBeTruthy();
    expect(purchase?.userId).toBe(userId);
    expect(purchase?.planId).toBe(planId);
    expect(await db.select().from(entitlementOutbox).where(eq(entitlementOutbox.orderId, order.id))).toEqual([
      expect.objectContaining({
        eventType: "entitlement.granted",
        orderId: order.id,
        purchaseId: purchase?.id,
      }),
    ]);
  });

  it("A2: already completed order → idempotent, ensures purchase exists", async () => {
    const order = await createTestOrder(userId, planId, { status: "completed", paidAmount: 9900 });

    const result = await completeOrder(order.id, userId, planId, {
      paidAmount: 9900,
    });

    expect(result.completed).toBe(true);
    expect(result.wasAlreadyCompleted).toBe(true);
  });

  it("A3: failed order cannot be completed", async () => {
    const order = await createTestOrder(userId, planId, { status: "failed" });

    const result = await completeOrder(order.id, userId, planId, {
      paidAmount: 9900,
    });

    expect(result.completed).toBe(false);
    // Order status should NOT change
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("failed");
  });

  it("A3b: canceled order cannot be completed", async () => {
    const order = await createTestOrder(userId, planId, { status: "canceled" });
    const result = await completeOrder(order.id, userId, planId, { paidAmount: 9900 });
    expect(result.completed).toBe(false);
  });

  it("A3c: nonexistent order → completed: false", async () => {
    const result = await completeOrder("nonexistent-id", userId, planId, { paidAmount: 9900 });
    expect(result.completed).toBe(false);
  });
});

describe("Order Lifecycle / ensureUserPurchase", () => {
  it("creates purchase if not exists → returns true", async () => {
    const order = await createTestOrder(userId, planId, { status: "completed" });
    const created = await ensureUserPurchase(userId, planId, order.id);
    expect(created).toBe(true);
  });

  it("existing purchase → returns false (no duplicate)", async () => {
    const order = await createTestOrder(userId, planId, { status: "completed" });
    await createTestPurchase(userId, planId, order.id);
    const created = await ensureUserPurchase(userId, planId, order.id);
    expect(created).toBe(false);
    expect(await db.select().from(entitlementOutbox).where(eq(entitlementOutbox.orderId, order.id))).toEqual([
      expect.objectContaining({ eventType: "entitlement.granted", orderId: order.id }),
    ]);
  });
});
