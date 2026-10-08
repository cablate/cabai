import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  failCheckoutReservation,
  finalizeCheckoutReservation,
  reserveCheckout,
} from "@/lib/checkout-reservation";
import { cleanTestData, createTestPlan, createTestUser } from "@/test/helpers";

let userId: string;
let planId: string;

beforeEach(async () => {
  await cleanTestData();
  userId = (await createTestUser({ email: `test-checkout-${crypto.randomUUID()}@example.com` })).id;
  planId = (await createTestPlan({ name: "Checkout reservation plan" })).id;
});

afterAll(cleanTestData);

function reserve(merchantOrderNumber: string, now = new Date("2026-07-15T00:00:00.000Z")) {
  return reserveCheckout({
    userId,
    planId,
    providerPlanId: "provider-plan-a",
    providerMode: "live",
    merchantOrderNumber,
    expectedAmount: 1_500,
    expectedCurrency: "TWD",
    now,
    leaseMs: 60_000,
  });
}

describe("checkout reservation", () => {
  it("serializes concurrent initialization without failing the first order", async () => {
    const [first, second] = await Promise.all([
      reserve("checkout-concurrent-a"),
      reserve("checkout-concurrent-b"),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(["in_progress", "new"]);
    const rows = await db.select().from(orders).where(and(
      eq(orders.userId, userId),
      eq(orders.planId, planId),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
  });

  it("reuses a finalized compatible checkout", async () => {
    const first = await reserve("checkout-reuse-a");
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    await expect(finalizeCheckoutReservation({
      orderId: first.orderId,
      portalySessionId: "session-reuse",
      checkoutUrl: "https://portaly.example/checkout/reuse",
      checkoutSessionExpiresAt: new Date("2026-07-15T00:10:00.000Z"),
    })).resolves.toBe(true);

    await expect(reserve("checkout-reuse-b")).resolves.toMatchObject({
      kind: "reuse",
      orderId: first.orderId,
      checkoutUrl: "https://portaly.example/checkout/reuse",
    });
  });

  it("replaces an expired finalized checkout instead of reusing its URL", async () => {
    const startedAt = new Date("2026-07-15T00:00:00.000Z");
    const first = await reserve("checkout-session-expired-a", startedAt);
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    await finalizeCheckoutReservation({
      orderId: first.orderId,
      portalySessionId: "session-expired",
      checkoutUrl: "https://portaly.example/checkout/expired",
      checkoutSessionExpiresAt: new Date("2026-07-15T00:01:00.000Z"),
      now: startedAt,
    });

    const second = await reserve(
      "checkout-session-expired-b",
      new Date("2026-07-15T00:01:01.000Z"),
    );
    expect(second.kind).toBe("new");
    expect(second.orderId).not.toBe(first.orderId);

    const oldOrder = await db.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    expect(oldOrder?.status).toBe("failed");
  });

  it("replaces a pending checkout when the provider plan mapping changes", async () => {
    const first = await reserve("checkout-provider-a");
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    await finalizeCheckoutReservation({
      orderId: first.orderId,
      portalySessionId: "session-provider-a",
      checkoutUrl: "https://portaly.example/checkout/provider-a",
      checkoutSessionExpiresAt: new Date("2026-07-15T00:10:00.000Z"),
    });

    const second = await reserveCheckout({
      userId,
      planId,
      providerPlanId: "provider-plan-b",
      providerMode: "live",
      merchantOrderNumber: "checkout-provider-b",
      expectedAmount: 1_500,
      expectedCurrency: "TWD",
      now: new Date("2026-07-15T00:00:30.000Z"),
      leaseMs: 60_000,
    });

    expect(second.kind).toBe("new");
    expect(second.orderId).not.toBe(first.orderId);
  });

  it("does not reuse a pending checkout across test and live modes", async () => {
    const first = await reserve("checkout-mode-test");
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    await finalizeCheckoutReservation({
      orderId: first.orderId,
      portalySessionId: "session-mode-test",
      checkoutUrl: "https://portaly.example/checkout/mode-test",
      checkoutSessionExpiresAt: new Date("2026-07-15T00:10:00.000Z"),
    });

    const second = await reserveCheckout({
      userId,
      planId,
      providerPlanId: "provider-plan-a",
      providerMode: "test",
      merchantOrderNumber: "checkout-mode-live",
      expectedAmount: 1_500,
      expectedCurrency: "TWD",
      now: new Date("2026-07-15T00:00:30.000Z"),
      leaseMs: 60_000,
    });

    expect(second.kind).toBe("new");
    expect(second.orderId).not.toBe(first.orderId);
  });

  it("allows takeover only after the initialization lease expires", async () => {
    const startedAt = new Date("2026-07-15T00:00:00.000Z");
    const first = await reserve("checkout-expire-a", startedAt);
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    const second = await reserve(
      "checkout-expire-b",
      new Date(startedAt.getTime() + 60_001),
    );
    expect(second.kind).toBe("new");

    const oldOrder = await db.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    expect(oldOrder?.status).toBe("failed");
  });

  it("does not let a late provider response revive a failed reservation", async () => {
    const first = await reserve("checkout-late-a");
    expect(first.kind).toBe("new");
    if (first.kind !== "new") throw new Error("Expected a new reservation");

    await expect(failCheckoutReservation(first.orderId)).resolves.toBe(true);
    await expect(finalizeCheckoutReservation({
      orderId: first.orderId,
      portalySessionId: "session-too-late",
      checkoutUrl: "https://portaly.example/checkout/late",
      checkoutSessionExpiresAt: new Date("2026-07-15T00:10:00.000Z"),
    })).resolves.toBe(false);

    const order = await db.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    expect(order?.status).toBe("failed");
    expect(order?.portalySessionId).toBeNull();
  });
});
