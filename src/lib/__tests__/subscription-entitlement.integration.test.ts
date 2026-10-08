import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlementOutbox, orders, userPurchases } from "@/lib/db/schema";
import {
  cleanTestData,
  createTestOrder,
  createTestPlan,
  createTestPurchase,
  createTestUser,
} from "@/test/helpers";
import { reconcileOrderSubscriptionState } from "@/lib/entitlement-transitions";

beforeEach(async () => {
  await cleanTestData();
});

async function subscriptionFixture(status = "active") {
  const user = await createTestUser();
  const plan = await createTestPlan({ billingPeriod: "monthly" });
  const order = await createTestOrder(user.id, plan.id, {
    status: "completed",
    subscriptionId: `sub-${crypto.randomUUID()}`,
    subscriptionStatus: status,
    nextBillingAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  const purchase = await createTestPurchase(user.id, plan.id, order.id);
  return { user, plan, order, purchase };
}

describe("subscription entitlement state machine", () => {
  it("temporarily revokes past_due access and restores it on active without losing the purchase", async () => {
    const { order, purchase } = await subscriptionFixture();

    const suspended = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.past-due",
      orderChanges: { subscriptionStatus: "past_due" },
    });
    expect(suspended.accessChanged).toBe(true);
    expect(suspended.purchasesRevoked).toBe(0);

    const stillPresent = await db.query.userPurchases.findFirst({
      where: eq(userPurchases.id, purchase.id),
    });
    expect(stillPresent?.revokedAt).toBeNull();

    const restored = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.active-again",
      orderChanges: { subscriptionStatus: "active" },
    });
    expect(restored.accessChanged).toBe(true);

    const events = await db.query.entitlementOutbox.findMany({
      where: eq(entitlementOutbox.orderId, order.id),
      orderBy: (event, { asc }) => asc(event.createdAt),
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "entitlement.revoked",
      "entitlement.granted",
    ]);
    expect(new Set(events.map((event) => event.idempotencyKey)).size).toBe(2);
  });

  it("keeps a canceled subscription active until its effective date, then revokes durably", async () => {
    const { order, purchase } = await subscriptionFixture();
    const observedAt = new Date("2026-07-15T00:00:00.000Z");
    const effectiveAt = new Date("2026-07-20T00:00:00.000Z");

    const scheduled = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.cancel-scheduled",
      occurredAt: observedAt,
      orderChanges: {
        subscriptionStatus: "canceled",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: effectiveAt,
      },
    });
    expect(scheduled.accessChanged).toBe(false);
    expect(scheduled.purchasesRevoked).toBe(0);

    const expired = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.cancel-effective",
      occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      orderChanges: {
        subscriptionStatus: "canceled",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: effectiveAt,
      },
    });
    expect(expired.purchasesRevoked).toBe(1);

    const revoked = await db.query.userPurchases.findFirst({
      where: eq(userPurchases.id, purchase.id),
    });
    expect(revoked?.revokedAt).toEqual(new Date("2026-07-21T00:00:00.000Z"));
    expect(revoked?.revokedBy).toBe("test.cancel-effective");

    const revokeEvent = await db.query.entitlementOutbox.findFirst({
      where: and(
        eq(entitlementOutbox.orderId, order.id),
        eq(entitlementOutbox.eventType, "entitlement.revoked"),
      ),
    });
    expect(revokeEvent).toBeTruthy();
  });

  it("uses nextBillingAt when an active period-end cancellation omits cancelEffectiveAt", async () => {
    const { order, purchase } = await subscriptionFixture();
    const paidThrough = new Date("2026-07-20T00:00:00.000Z");

    const scheduled = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.cancel-next-billing",
      occurredAt: new Date("2026-07-15T00:00:00.000Z"),
      orderChanges: {
        subscriptionStatus: "active",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: null,
        nextBillingAt: paidThrough,
      },
    });
    expect(scheduled.accessChanged).toBe(false);
    expect(scheduled.purchasesRevoked).toBe(0);

    const expired = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.cancel-next-billing-expired",
      occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      orderChanges: {
        subscriptionStatus: "active",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: null,
        nextBillingAt: paidThrough,
      },
    });
    expect(expired.purchasesRevoked).toBe(1);

    const saved = await db.query.userPurchases.findFirst({
      where: eq(userPurchases.id, purchase.id),
    });
    expect(saved?.revokedBy).toBe("test.cancel-next-billing-expired");
  });

  it("revokes null-to-expired provider state instead of only active-to-canceled", async () => {
    const { order, purchase } = await subscriptionFixture("active");
    await db.update(orders).set({ subscriptionStatus: null }).where(eq(orders.id, order.id));

    const result = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "test.expired",
      orderChanges: { subscriptionStatus: "expired" },
    });

    expect(result.purchasesRevoked).toBe(1);
    const row = await db.query.userPurchases.findFirst({
      where: eq(userPurchases.id, purchase.id),
    });
    expect(row?.revokedAt).not.toBeNull();
  });

  it("can recover lifecycle cancellation but never restores an explicit refund", async () => {
    const { order, purchase } = await subscriptionFixture();
    const now = new Date();
    await db.update(orders).set({ status: "refunded", refundedAt: now }).where(eq(orders.id, order.id));
    await db.update(userPurchases).set({
      revokedAt: now,
      revokedBy: "callback.portaly",
      expiresAt: now,
    }).where(eq(userPurchases.id, purchase.id));

    const result = await reconcileOrderSubscriptionState({
      orderId: order.id,
      triggeredBy: "subscription.resume:test",
      orderChanges: { status: "completed", subscriptionStatus: "active" },
    });

    expect(result.accessChanged).toBe(false);
    const [savedOrder, savedPurchase] = await Promise.all([
      db.query.orders.findFirst({ where: eq(orders.id, order.id) }),
      db.query.userPurchases.findFirst({ where: eq(userPurchases.id, purchase.id) }),
    ]);
    expect(savedOrder?.status).toBe("refunded");
    expect(savedPurchase?.revokedAt).not.toBeNull();
  });
});
