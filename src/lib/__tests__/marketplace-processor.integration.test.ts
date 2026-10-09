/**
 * Phase 2: Marketplace Processor — A6-A10
 * Tests marketplace event processing: paid flow, pending_mapping, idempotency, refund.
 * Real DB, mocks Discord (external service).
 */
import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestPlan, createTestProductMapping,
  createTestMarketplaceEvent, createTestUser, createTestPurchase, cleanTestData,
} from "@/test/helpers";
import {
  processMarketplaceEvent,
  processPendingForProduct,
} from "@/lib/marketplace-processor";
import { applyPortalyPurchaseImport } from "@/lib/portaly-purchase-import";
import { db } from "@/lib/db";
import { orders, portalyMarketplaceEvents, userPurchases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock external services
vi.mock("@/lib/discord", () => ({
  grantDiscordRolesForPlan: vi.fn().mockResolvedValue(undefined),
  revokeDiscordRolesForPlan: vi.fn().mockResolvedValue(undefined),
}));

let planId: string;

beforeAll(async () => {
  await cleanTestData();
  const plan = await createTestPlan({ name: "Marketplace Plan" });
  planId = plan.id;
});

afterAll(async () => {
  await cleanTestData();
});

describe("Marketplace Processor / Paid flow (A6-A8)", () => {
  it("A6: paid event with mapping → creates user + order + purchase", async () => {
    await createTestProductMapping("prod_mkt_1", planId);
    const event = await createTestMarketplaceEvent({
      portalyProductId: "prod_mkt_1",
      customerEmail: "test-buyer-a6@example.com",
      amount: 5000,
    });

    const result = await processMarketplaceEvent(event.id, { verifiedImport: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe("processed");

    // Verify event was updated
    const dbEvent = await db.query.portalyMarketplaceEvents.findFirst({
      where: eq(portalyMarketplaceEvents.id, event.id),
    });
    expect(dbEvent?.status).toBe("processed");
    expect(dbEvent?.matchedPlanId).toBe(planId);
    expect(dbEvent?.matchedUserId).toBeTruthy();
    expect(dbEvent?.createdOrderId).toBeTruthy();

    // Verify order was created
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, dbEvent!.createdOrderId!),
    });
    expect(order?.status).toBe("completed");
    expect(order?.paidAmount).toBe(5000);
  });

  it("A7: paid event without mapping → pending_mapping", async () => {
    const event = await createTestMarketplaceEvent({
      portalyProductId: "prod_unmapped",
      customerEmail: "test-buyer-a7@example.com",
    });

    const result = await processMarketplaceEvent(event.id, { verifiedImport: true });

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending_mapping");

    const dbEvent = await db.query.portalyMarketplaceEvents.findFirst({
      where: eq(portalyMarketplaceEvents.id, event.id),
    });
    expect(dbEvent?.status).toBe("pending_mapping");
  });

  it("A8: duplicate event (already processed) → idempotent", async () => {
    await createTestProductMapping("prod_mkt_dup", planId);
    const event = await createTestMarketplaceEvent({
      portalyProductId: "prod_mkt_dup",
      customerEmail: "test-buyer-a8@example.com",
      status: "processed",
    });

    const result = await processMarketplaceEvent(event.id, { verifiedImport: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe("processed");
  });
});

describe("Marketplace Processor / Refund flow (A9-A10)", () => {
  it("A9: refund event with matching paid → revokes purchase + refunds order", async () => {
    await createTestProductMapping("prod_refund", planId);
    const orderId = `refund-test-${crypto.randomUUID().slice(0, 8)}`;

    // 1. Create and process the paid event
    const paidEvent = await createTestMarketplaceEvent({
      portalyOrderId: orderId,
      portalyProductId: "prod_refund",
      customerEmail: "test-buyer-refund@example.com",
      event: "paid",
      amount: 5000,
    });
    await processMarketplaceEvent(paidEvent.id, { verifiedImport: true });

    // 2. Create and process the refund event (same orderId, different event type)
    const refundEvent = await createTestMarketplaceEvent({
      portalyOrderId: orderId,
      portalyProductId: "prod_refund",
      customerEmail: "test-buyer-refund@example.com",
      event: "refund",
      amount: 5000,
    });
    const result = await processMarketplaceEvent(refundEvent.id, { verifiedImport: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe("refunded");

    // 3. Verify the original order was refunded
    const paidDbEvent = await db.query.portalyMarketplaceEvents.findFirst({
      where: eq(portalyMarketplaceEvents.id, paidEvent.id),
    });
    if (paidDbEvent?.createdOrderId) {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, paidDbEvent.createdOrderId),
      });
      expect(order?.status).toBe("refunded");
    }
  });

  it("A10: refund without a processed paid event stays retryable instead of becoming a false no-op", async () => {
    const refundEvent = await createTestMarketplaceEvent({
      portalyOrderId: "no-match-order",
      portalyProductId: "prod_refund",
      event: "refund",
    });

    const result = await processMarketplaceEvent(refundEvent.id, { verifiedImport: true });

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    const saved = await db.query.portalyMarketplaceEvents.findFirst({
      where: eq(portalyMarketplaceEvents.id, refundEvent.id),
    });
    expect(saved?.status).toBe("pending");
  });

  it("quarantines stored paid/refund events during a generic retry", async () => {
    const productId = `prod_retry_${crypto.randomUUID().slice(0, 8)}`;
    const orderId = `retry-order-${crypto.randomUUID().slice(0, 8)}`;
    await createTestProductMapping(productId, planId);
    const paid = await createTestMarketplaceEvent({
      portalyOrderId: orderId,
      portalyProductId: productId,
      customerEmail: "test-buyer-retry@example.com",
      event: "paid",
      status: "failed",
    });
    const refund = await createTestMarketplaceEvent({
      portalyOrderId: orderId,
      portalyProductId: productId,
      customerEmail: "test-buyer-retry@example.com",
      event: "refund",
      status: "pending",
    });

    const batch = await processPendingForProduct(productId);

    expect(batch).toEqual({ total: 2, processed: 0, failed: 2 });
    const [savedPaid, savedRefund] = await Promise.all([
      db.query.portalyMarketplaceEvents.findFirst({
        where: eq(portalyMarketplaceEvents.id, paid.id),
      }),
      db.query.portalyMarketplaceEvents.findFirst({
        where: eq(portalyMarketplaceEvents.id, refund.id),
      }),
    ]);
    expect(savedPaid?.status).toBe("failed");
    expect(savedRefund?.status).toBe("pending");
  });
});

it("only processes a quarantined event type confirmed by the admin export", async () => {
  const orderId = `reconciled-${crypto.randomUUID()}`;
  const email = "reconciled@example.invalid";
  const paid = await createTestMarketplaceEvent({ portalyOrderId: orderId, portalyProductId: "legacy-reconcile", customerEmail: email, event: "paid", amount: 100 });
  const refund = await createTestMarketplaceEvent({ portalyOrderId: orderId, portalyProductId: "legacy-reconcile", customerEmail: email, event: "refund", amount: 100 });
  expect((await processMarketplaceEvent(paid.id)).success).toBe(false);
  expect((await processMarketplaceEvent(refund.id)).success).toBe(false);
  const importStatus = (status: string) => applyPortalyPurchaseImport({ planId, fileName: "synthetic-provider-export.csv", bytes: Buffer.from(`paidAt,orderId,amount,status,email\n2026-01-01T00:00:00Z,${orderId},100,${status},${email}\n`) });
  expect((await importStatus("paid")).processedRows).toBe(1);
  expect((await processMarketplaceEvent(refund.id)).success).toBe(false);
  const stored = await db.query.portalyMarketplaceEvents.findFirst({ where: eq(portalyMarketplaceEvents.id, paid.id) });
  expect((await db.query.orders.findFirst({ where: eq(orders.id, stored!.createdOrderId!) }))?.status).toBe("completed");
  expect((await importStatus("refund")).processedRows).toBe(1);
  expect((await db.query.orders.findFirst({ where: eq(orders.id, stored!.createdOrderId!) }))?.status).toBe("refunded");
});

describe("Marketplace paid replay order binding", () => {
  async function fixture(status: "completed" | "refunded" = "completed") {
    const user = await createTestUser();
    const merchantId = `replay-${crypto.randomUUID()}`;
    const [order] = await db.insert(orders).values({
      userId: user.id, planId, merchantOrderNumber: `mkt-${merchantId}`,
      status, paidAmount: 100, currency: "TWD",
    }).returning({ id: orders.id });
    const event = await createTestMarketplaceEvent({
      portalyOrderId: merchantId, customerEmail: user.email, amount: 100,
      status: "pending_mapping",
    });
    return { user, order: order!, event };
  }

  it("does not grant another plan when an incomplete event already has an order", async () => {
    const { user, order, event } = await fixture();
    const original = await createTestPurchase(user.id, planId, order.id);
    const otherPlan = await createTestPlan({ name: "Other synthetic plan" });
    const result = await processMarketplaceEvent(event.id, { verifiedImport: true, planIdOverride: otherPlan.id });
    expect(result.status).toBe("failed");
    const purchases = await db.select().from(userPurchases).where(eq(userPurchases.orderId, order.id));
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toEqual(expect.objectContaining({ id: original.id, planId, revokedAt: null }));
    const stored = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(stored?.planId).toBe(planId);
    expect(stored?.status).toBe("completed");
  });

  it("repairs a matching completed order only once", async () => {
    const { order, event } = await fixture();
    expect((await processMarketplaceEvent(event.id, { verifiedImport: true, planIdOverride: planId })).success).toBe(true);
    await db.update(portalyMarketplaceEvents).set({ status: "pending" }).where(eq(portalyMarketplaceEvents.id, event.id));
    expect((await processMarketplaceEvent(event.id, { verifiedImport: true, planIdOverride: planId })).success).toBe(true);
    expect(await db.select().from(userPurchases).where(eq(userPurchases.orderId, order.id))).toHaveLength(1);
  });

  it("never regrants a refunded order through an incomplete paid event", async () => {
    const { order, event } = await fixture("refunded");
    expect((await processMarketplaceEvent(event.id, { verifiedImport: true, planIdOverride: planId })).status).toBe("failed");
    expect(await db.select().from(userPurchases).where(eq(userPurchases.orderId, order.id))).toHaveLength(0);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("refunded");
  });
});
