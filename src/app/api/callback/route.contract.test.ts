import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  verifyCallback: vi.fn(),
  findOrder: vi.fn(),
  findPlan: vi.fn(),
  findUser: vi.fn(),
  dbUpdate: vi.fn(),
  completeOrder: vi.fn(),
  enqueueEntitlementWebhooks: vi.fn(),
  grantDiscordRolesForPlan: vi.fn(),
  revokeDiscordRolesForPlan: vi.fn(),
  revokeOrderEntitlement: vi.fn(),
  writeAuditLog: vi.fn(),
  rateLimitCheck: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/portaly", () => ({
  verifyCallback: mocks.verifyCallback,
  PORTALY_MODE: "test",
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      orders: { findFirst: mocks.findOrder },
      plans: { findFirst: mocks.findPlan },
      users: { findFirst: mocks.findUser },
    },
    update: mocks.dbUpdate,
  },
}));

vi.mock("@/lib/order-lifecycle", () => ({
  completeOrder: mocks.completeOrder,
}));

vi.mock("@/lib/entitlement-transitions", () => ({
  revokeOrderEntitlement: mocks.revokeOrderEntitlement,
}));

vi.mock("@/lib/webhook-outbox", () => ({
  enqueueEntitlementWebhooks: mocks.enqueueEntitlementWebhooks,
}));

vi.mock("@/lib/discord", () => ({
  grantDiscordRolesForPlan: mocks.grantDiscordRolesForPlan,
  revokeDiscordRolesForPlan: mocks.revokeDiscordRolesForPlan,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/rate-limit", () => ({
  callbackLimiter: { check: mocks.rateLimitCheck },
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/rate-limit-response", () => ({
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => mocks.logger,
}));

vi.mock("@/lib/observability/capture", () => ({
  captureOperationalException: mocks.captureException,
  captureOperationalMessage: mocks.captureMessage,
}));

vi.mock("@/lib/event-tracking", () => ({ recordEvent: vi.fn() }));

import { POST } from "./route";

const order = {
  id: "order-1",
  userId: "user-1",
  planId: "plan-1",
  providerPlanId: null,
  merchantOrderNumber: "merchant-order-1",
  portalySessionId: null,
  status: "pending",
  currency: "TWD",
  expectedAmount: null,
  expectedCurrency: null,
};

const plan = {
  id: "plan-1",
  providerPlanId: null,
  amount: 9900,
  currency: "TWD",
};

function callbackRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://cabai.example/api/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-portaly-timestamp": "2026-07-13T00:00:00.000Z",
      "x-portaly-signature": "valid-signature",
      "x-portaly-event": "checkout.completed",
    },
    body: JSON.stringify({
      event: "checkout.completed",
      merchantOrderNumber: order.merchantOrderNumber,
      status: "completed",
      mode: "test",
      amount: plan.amount,
      currency: plan.currency,
      planId: plan.id,
      ...overrides,
    }),
  });
}

function revokeCallbackRequest(): Request {
  return new Request("https://cabai.example/api/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-portaly-timestamp": "2026-07-13T00:00:00.000Z",
      "x-portaly-signature": "valid-signature",
      "x-portaly-event": "subscription.canceled",
    },
    body: JSON.stringify({ event: "subscription.canceled", sessionId: "session-1" }),
  });
}

const refundEvent = "creator_subscription.payment.refunded";
const refundPayload = {
  event: refundEvent,
  mode: "test",
  orderId: "provider-order-1",
  paymentId: "provider-payment-1",
  orderMerchantOrderNumber: order.merchantOrderNumber,
  amount: plan.amount,
  currency: plan.currency,
  refundedAmount: plan.amount,
  refundedAt: "2026-10-09T01:02:03.000Z",
};

function eventRequest(event: string, payload: Record<string, unknown>): Request {
  return new Request("https://cabai.example/api/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-portaly-timestamp": "2026-10-09T01:02:03.000Z",
      "x-portaly-signature": "valid-signature",
      "x-portaly-event": event,
    },
    body: JSON.stringify({ event, ...payload }),
  });
}

function refundRequest(overrides: Record<string, unknown> = {}): Request {
  return eventRequest(refundEvent, { ...refundPayload, ...overrides });
}

function expectNoMutation() {
  expect(mocks.revokeOrderEntitlement).not.toHaveBeenCalled();
  expect(mocks.completeOrder).not.toHaveBeenCalled();
  expect(mocks.dbUpdate).not.toHaveBeenCalled();
  expect(mocks.writeAuditLog).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimitCheck.mockReturnValue({ success: true });
  mocks.verifyCallback.mockReturnValue(true);
  mocks.findOrder.mockResolvedValue(order);
  mocks.findPlan.mockResolvedValue(plan);
  mocks.dbUpdate.mockImplementation(() => ({
    set: () => ({ where: () => Promise.resolve([]) }),
  }));
  mocks.completeOrder.mockResolvedValue({
    completed: true,
    wasAlreadyCompleted: false,
    purchaseCreated: false,
  });
  mocks.enqueueEntitlementWebhooks.mockResolvedValue({ matchedServices: 0, enqueued: 0 });
  mocks.grantDiscordRolesForPlan.mockResolvedValue(undefined);
  mocks.revokeDiscordRolesForPlan.mockResolvedValue(undefined);
  mocks.revokeOrderEntitlement.mockResolvedValue({
    found: true,
    purchasesRevoked: 1,
    transitionsEnsured: 1,
  });
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe("Portaly callback acknowledgement contract", () => {
  it.each([undefined, "subscription.canceled", "CHECKOUT.COMPLETED", 123])("rejects an unauthenticated or mismatched event before state changes: %s", async (event) => {
    const response = await POST(callbackRequest({ event }));
    expect(response.status).toBe(200);
    expect(mocks.verifyCallback).toHaveBeenCalled();
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.completeOrder).not.toHaveBeenCalled();
    expect(mocks.revokeOrderEntitlement).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
  it("acknowledges an invalid signature without processing the payment", async () => {
    mocks.verifyCallback.mockReturnValue(false);

    const response = await POST(callbackRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.completeOrder).not.toHaveBeenCalled();
  });

  it("returns non-2xx when a verified callback cannot complete its order", async () => {
    mocks.completeOrder.mockResolvedValue({
      completed: false,
      wasAlreadyCompleted: false,
      purchaseCreated: false,
    });

    const response = await POST(callbackRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(mocks.completeOrder).toHaveBeenCalledOnce();
    expect(mocks.enqueueEntitlementWebhooks).not.toHaveBeenCalled();
    expect(mocks.grantDiscordRolesForPlan).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      "Verified callback requires provider retry",
      "error",
      expect.objectContaining({
        errorCode: "CALLBACK_RETRYABLE_FAILURE",
        surface: "callback",
      }),
    );
  });

  it("turns an unexpected verified processing exception into a retryable, traceable 500", async () => {
    mocks.findOrder.mockRejectedValue(new Error("postgresql://owner:private@db/app"));

    const response = await POST(callbackRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        errorCode: "CALLBACK_INTERNAL_ERROR",
        requestId: response.headers.get("x-request-id"),
        surface: "callback",
      }),
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Verified callback failed before acknowledgement",
      expect.not.objectContaining({ error: expect.anything() }),
    );
  });

  it("returns non-2xx when verified order completion throws", async () => {
    mocks.completeOrder.mockRejectedValue(new Error("temporary database failure"));

    const response = await POST(callbackRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(mocks.enqueueEntitlementWebhooks).not.toHaveBeenCalled();
    expect(mocks.grantDiscordRolesForPlan).not.toHaveBeenCalled();
  });

  it("keeps an already-completed callback idempotent", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, status: "completed" });
    mocks.completeOrder.mockResolvedValue({
      completed: true,
      wasAlreadyCompleted: true,
      purchaseCreated: false,
    });

    const response = await POST(callbackRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.completeOrder).toHaveBeenCalledOnce();
    expect(mocks.enqueueEntitlementWebhooks).not.toHaveBeenCalled();
    expect(mocks.grantDiscordRolesForPlan).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("validates the provider plan recorded on the order instead of a newer product mapping", async () => {
    mocks.findOrder.mockResolvedValue({
      ...order,
      providerPlanId: "provider-plan-original",
    });
    mocks.findPlan.mockResolvedValue({
      ...plan,
      providerPlanId: "provider-plan-new",
    });

    const response = await POST(callbackRequest({ planId: "provider-plan-original" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.completeOrder).toHaveBeenCalledOnce();
  });

  it("acknowledges a callback for an explicitly non-completable terminal order", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, status: "refunded" });

    const response = await POST(callbackRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.findPlan).not.toHaveBeenCalled();
    expect(mocks.completeOrder).not.toHaveBeenCalled();
  });

  it("returns non-2xx when a verified revoke cannot remove the local entitlement", async () => {
    mocks.findOrder.mockResolvedValue({
      ...order,
      portalySessionId: "session-1",
      status: "completed",
    });
    mocks.revokeOrderEntitlement.mockRejectedValue(new Error("temporary database failure"));

    const response = await POST(revokeCallbackRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
    expect(mocks.revokeDiscordRolesForPlan).not.toHaveBeenCalled();
  });
});

describe("Portaly Payment refund callback contract", () => {
  const paymentOrder = {
    ...order,
    status: "completed",
    providerMode: "test",
    portalySessionId: "session-1",
    subscriptionId: null,
    paidAmount: plan.amount,
    expectedAmount: plan.amount,
  };

  beforeEach(() => {
    mocks.findOrder.mockResolvedValue(paymentOrder);
    mocks.findPlan.mockResolvedValue({ ...plan, billingPeriod: "one-time" });
  });

  it.each(["completed", "pending", "refunded"])("revokes a fully verified %s order using only its merchant number", async (status) => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, status });
    const response = await POST(refundRequest({ sessionId: "session-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.findOrder).toHaveBeenCalledOnce();
    const lookup = new PgDialect().sqlToQuery(mocks.findOrder.mock.calls[0]![0].where);
    expect(lookup.sql).toContain('"merchant_order_number"');
    expect(lookup.sql).not.toContain('"subscription_id"');
    expect(lookup.sql).not.toContain('"portaly_session_id"');
    expect(lookup.params).toEqual([order.merchantOrderNumber]);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledWith(expect.objectContaining({
      orderId: order.id,
      occurredAt: new Date(refundPayload.refundedAt),
      orderChanges: expect.objectContaining({
        status: "refunded",
        refundAmount: refundPayload.refundedAmount,
        refundedAt: new Date(refundPayload.refundedAt),
      }),
    }));
    expect(mocks.completeOrder).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("accepts the reserved amount before checkout completion and legacy missing providerMode", async () => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, status: "pending", paidAmount: null, providerMode: null });
    expect((await POST(refundRequest())).status).toBe(200);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("accepts both optional identifiers only when both match the local order", async () => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, subscriptionId: "subscription-1" });
    expect((await POST(refundRequest({ sessionId: "session-1", subscriptionId: "subscription-1" }))).status).toBe(200);
    expect(mocks.findOrder).toHaveBeenCalledOnce();
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("accepts a subscription identifier bound to the existing Payment session", async () => {
    expect((await POST(refundRequest({ subscriptionId: "session-1" }))).status).toBe(200);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("accepts integer zero refund evidence when the local paid amount is zero", async () => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, paidAmount: 0 });
    expect((await POST(refundRequest({ amount: 0, refundedAmount: 0 }))).status).toBe(200);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("rejects a wrong session even when the supplied subscription matches", async () => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, subscriptionId: "subscription-1" });
    expect((await POST(refundRequest({ sessionId: "session-other", subscriptionId: "subscription-1" }))).status).toBe(200);
    expectNoMutation();
  });

  it.each([
    ["mode", undefined], ["mode", "sandbox"],
    ["orderId", undefined], ["orderId", ""], ["orderId", 1],
    ["paymentId", undefined], ["paymentId", ""],
    ["orderMerchantOrderNumber", undefined], ["orderMerchantOrderNumber", ""],
    ["amount", undefined], ["amount", "9900"], ["amount", -1], ["amount", 1.5],
    ["currency", undefined], ["currency", ""],
    ["refundedAmount", undefined], ["refundedAmount", "9900"], ["refundedAmount", -1], ["refundedAmount", 1.5],
    ["refundedAt", undefined], ["refundedAt", "not-a-date"], ["refundedAt", "2026-10-09"],
    ["sessionId", 123], ["subscriptionId", 123],
  ])("acknowledges malformed refund %s=%s before querying state", async (field, value) => {
    expect((await POST(refundRequest({ [field]: value }))).status).toBe(200);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each([
    { refundedAmount: plan.amount - 1 },
    { amount: plan.amount + 1, refundedAmount: plan.amount + 1 },
    { currency: "USD" },
    { sessionId: "session-other" },
    { subscriptionId: "subscription-other" },
    { sessionId: "session-1", subscriptionId: "subscription-other" },
  ])("does not revoke when payment evidence differs from the local order: %j", async (overrides) => {
    expect((await POST(refundRequest(overrides))).status).toBe(200);
    expect(mocks.findOrder).toHaveBeenCalledOnce();
    expectNoMutation();
  });

  it.each([
    { merchantOrderNumber: "merchant-other" },
    { providerMode: "live" },
    { portalySessionId: null },
    { paidAmount: plan.amount - 1 },
    { paidAmount: null, expectedAmount: null },
  ])("does not revoke a locally mismatched or unbound order: %j", async (overrides) => {
    mocks.findOrder.mockResolvedValue({ ...paymentOrder, ...overrides });
    expect((await POST(refundRequest())).status).toBe(200);
    expectNoMutation();
  });

  it.each(["monthly", "yearly"])("does not apply the one-time refund contract to %s plans", async (billingPeriod) => {
    mocks.findPlan.mockResolvedValue({ ...plan, billingPeriod });
    expect((await POST(refundRequest())).status).toBe(200);
    expectNoMutation();
  });

  it("never resolves a refund from subscriptionId without the exact merchant order number", async () => {
    expect((await POST(refundRequest({ orderMerchantOrderNumber: undefined, subscriptionId: "subscription-1" }))).status).toBe(200);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("returns retryable 500 when the exact local order has not arrived yet", async () => {
    mocks.findOrder.mockResolvedValue(undefined);
    const response = await POST(refundRequest({ subscriptionId: "subscription-1" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(mocks.findOrder).toHaveBeenCalledOnce();
    expectNoMutation();
  });

  it("returns retryable 500 on a local lookup outage", async () => {
    mocks.findOrder.mockRejectedValue(new Error("temporary database failure"));
    expect((await POST(refundRequest())).status).toBe(500);
    expectNoMutation();
  });

  it("returns retryable 500 when the entitlement revocation fails", async () => {
    mocks.revokeOrderEntitlement.mockRejectedValue(new Error("temporary database failure"));
    expect((await POST(refundRequest())).status).toBe(500);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns retryable 500 when the order disappears during revocation", async () => {
    mocks.revokeOrderEntitlement.mockResolvedValue({ found: false, purchasesRevoked: 0, transitionsEnsured: 0 });
    expect((await POST(refundRequest())).status).toBe(500);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("acknowledges refund_failed without looking up or revoking an order", async () => {
    const event = "creator_subscription.payment.refund_failed";
    expect((await POST(eventRequest(event, { ...refundPayload, event }))).status).toBe(200);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.findPlan).not.toHaveBeenCalled();
    expectNoMutation();
  });
});

describe("Portaly callback global mode isolation", () => {
  it.each([
    "checkout.completed", "creator_subscription.checkout.completed",
    "subscription.canceled", "subscription.expired", "checkout.refunded",
    "creator_subscription.canceled", "creator_subscription.expired", refundEvent,
  ])("rejects provided live mode before querying state for %s", async (event) => {
    const response = await POST(eventRequest(event, { ...refundPayload, event, mode: "live", sessionId: "session-1" }));
    expect(response.status).toBe(200);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("preserves legacy cancellation without a mode field", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, status: "completed", portalySessionId: "session-1" });
    expect((await POST(revokeCallbackRequest())).status).toBe(200);
    expect(mocks.revokeOrderEntitlement).toHaveBeenCalledOnce();
  });

  it("preserves legacy checkout without a mode field", async () => {
    expect((await POST(callbackRequest({ mode: undefined }))).status).toBe(200);
    expect(mocks.completeOrder).toHaveBeenCalledOnce();
  });
});
