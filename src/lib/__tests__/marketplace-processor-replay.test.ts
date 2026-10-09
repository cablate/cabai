import { beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic caller-contract tests only: no provider export, environment, or DB.
// Query assertions prove the requested lock is called, not PostgreSQL concurrency.
const mocks = vi.hoisted(() => {
  const event = {
    id: "event-synthetic", status: "pending_mapping", event: "paid",
    portalyOrderId: "order-synthetic", portalyProductId: "product-synthetic",
    customerEmail: "synthetic@example.invalid", customerName: null,
    amount: 100, currency: "TWD", paymentMethod: null, rawPayload: {},
    portalyCreatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const existingOrder = {
    id: "local-order-synthetic", userId: "user-synthetic", planId: "plan-A",
    status: "completed", paidAmount: 100, currency: "TWD",
  };
  const insertValues = vi.fn();
  const lockOrder = vi.fn();
  const selectWhere = vi.fn(() => ({ for: lockOrder }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const setEvent = vi.fn();
  const ensurePurchase = vi.fn();
  const recordEvent = vi.fn();
  const tx = { insert: vi.fn(() => ({ values: insertValues })), select };
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
  return {
    event, existingOrder, insertValues, lockOrder, selectWhere, selectFrom,
    select, setEvent, ensurePurchase, recordEvent, tx, transaction,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: vi.fn(), inArray: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  query: {
    portalyMarketplaceEvents: { findFirst: vi.fn(async () => ({ ...mocks.event })) },
    users: { findFirst: vi.fn(async () => ({ id: "user-synthetic" })) },
  },
  transaction: mocks.transaction,
  update: vi.fn(() => ({ set: mocks.setEvent })),
} }));
vi.mock("@/lib/db/schema", () => ({
  users: { email: "email", id: "id" },
  orders: {
    id: "id", userId: "userId", planId: "planId", status: "status",
    paidAmount: "paidAmount", currency: "currency", merchantOrderNumber: "merchantOrderNumber",
  },
  portalyProductMappings: { portalyProductId: "portalyProductId" },
  portalyMarketplaceEvents: { id: "id" },
}));
vi.mock("@/lib/entitlement-transitions", () => ({
  ensurePaymentPurchaseInTransaction: mocks.ensurePurchase, revokeOrderEntitlement: vi.fn(),
}));
vi.mock("@/lib/event-tracking", () => ({ recordEvent: mocks.recordEvent }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/log-redact", () => ({ maskEmail: () => "masked" }));

import { processMarketplaceEvent } from "@/lib/marketplace-processor";
import { orders } from "@/lib/db/schema";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.event.status = "pending_mapping";
  mocks.insertValues.mockReturnValue({
    onConflictDoNothing: () => ({ returning: async () => [] }),
  });
  mocks.lockOrder.mockResolvedValue([{ ...mocks.existingOrder }]);
  mocks.setEvent.mockReturnValue({ where: async () => undefined });
  mocks.ensurePurchase.mockResolvedValue({ id: "purchase-synthetic", created: false });
});

const verifiedOptions = { verifiedImport: true as const, planIdOverride: "plan-A" };
const bindingError = "Existing marketplace order does not match the verified payment; reconciliation is required.";

describe("Marketplace paid replay: existing order binding", () => {
  it("locks and reuses a matching completed order before ensuring its purchase", async () => {
    expect(await processMarketplaceEvent(mocks.event.id, verifiedOptions))
      .toEqual({ success: true, status: "processed" });
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith({
      id: orders.id, userId: orders.userId, planId: orders.planId,
      status: orders.status, paidAmount: orders.paidAmount, currency: orders.currency,
    });
    expect(mocks.selectFrom).toHaveBeenCalledExactlyOnceWith(orders);
    expect(mocks.selectWhere).toHaveBeenCalledExactlyOnceWith({
      column: orders.merchantOrderNumber, value: "mkt-order-synthetic",
    });
    expect(mocks.lockOrder).toHaveBeenCalledExactlyOnceWith("update");
    expect(mocks.ensurePurchase).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      userId: "user-synthetic", planId: "plan-A", orderId: mocks.existingOrder.id,
      source: "marketplace", triggeredBy: "marketplace.paid-replay",
      grantedAt: mocks.event.portalyCreatedAt,
    });
    expect(mocks.lockOrder.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.ensurePurchase.mock.invocationCallOrder[0]!);
    expect(mocks.setEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: "processed", matchedPlanId: "plan-A", createdOrderId: mocks.existingOrder.id,
    }));
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("creates a new order and ensures its purchase without replay lookup", async () => {
    mocks.insertValues.mockReturnValue({
      onConflictDoNothing: () => ({ returning: async () => [{ id: "new-order-synthetic" }] }),
    });
    expect(await processMarketplaceEvent(mocks.event.id, verifiedOptions))
      .toEqual({ success: true, status: "processed" });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-synthetic", planId: "plan-A", status: "completed",
      merchantOrderNumber: "mkt-order-synthetic", paidAmount: 100, currency: "TWD",
    }));
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.ensurePurchase).toHaveBeenCalledExactlyOnceWith(mocks.tx, expect.objectContaining({
      orderId: "new-order-synthetic", planId: "plan-A", triggeredBy: "marketplace.paid",
    }));
    expect(mocks.recordEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      eventType: "purchase_completed",
    }));
  });

  it.each([
    ["user mismatch", { userId: "other-user" }],
    ["plan mismatch", { planId: "plan-B" }],
    ["amount mismatch", { paidAmount: 101 }],
    ["currency mismatch", { currency: "USD" }],
    ["refunded order", { status: "refunded" }],
    ["pending order", { status: "pending" }],
  ])("rejects %s without granting or marking processed", async (_label, changes) => {
    mocks.lockOrder.mockResolvedValue([{ ...mocks.existingOrder, ...changes }]);
    const result = await processMarketplaceEvent(mocks.event.id, verifiedOptions);
    expect(result).toEqual({ success: false, status: "failed", error: bindingError });
    expect(mocks.lockOrder).toHaveBeenCalledExactlyOnceWith("update");
    expect(mocks.ensurePurchase).not.toHaveBeenCalled();
    expect(mocks.setEvent).toHaveBeenCalledExactlyOnceWith({ status: "failed", error: result.error });
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("fails closed when the conflicting order cannot be found", async () => {
    mocks.lockOrder.mockResolvedValue([]);
    expect(await processMarketplaceEvent(mocks.event.id, verifiedOptions))
      .toEqual({ success: false, status: "failed", error: bindingError });
    expect(mocks.ensurePurchase).not.toHaveBeenCalled();
    expect(mocks.setEvent).toHaveBeenCalledExactlyOnceWith({ status: "failed", error: expect.any(String) });
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("rejects a verified plan-B override replay against an existing plan-A order", async () => {
    expect(await processMarketplaceEvent(mocks.event.id, { verifiedImport: true, planIdOverride: "plan-B" }))
      .toEqual({ success: false, status: "failed", error: bindingError });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan-B" }));
    expect(mocks.ensurePurchase).not.toHaveBeenCalled();
    expect(mocks.setEvent).toHaveBeenCalledExactlyOnceWith({ status: "failed", error: bindingError });
  });

  it.each(["processed", "refunded"])("preserves terminal %s event early return", async (status) => {
    mocks.event.status = status;
    expect(await processMarketplaceEvent(mocks.event.id, { verifiedImport: true, planIdOverride: "plan-B" }))
      .toEqual({ success: true, status });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.ensurePurchase).not.toHaveBeenCalled();
    expect(mocks.setEvent).not.toHaveBeenCalled();
  });

  it("quarantines unverified legacy replay before any order transaction", async () => {
    expect(await processMarketplaceEvent(mocks.event.id, { planIdOverride: "plan-B" }))
      .toEqual({ success: false, status: "failed", error: expect.any(String) });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.ensurePurchase).not.toHaveBeenCalled();
    expect(mocks.setEvent).not.toHaveBeenCalled();
  });
});
