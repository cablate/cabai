import { beforeEach, describe, expect, it, vi } from "vitest";

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
