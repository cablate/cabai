import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPlan: vi.fn(),
  reserveCheckout: vi.fn(),
  failCheckoutReservation: vi.fn(),
  finalizeCheckoutReservation: vi.fn(),
  createCheckoutSession: vi.fn(),
  recordEvent: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", email: "buyer@example.com" } }),
}));
vi.mock("@/lib/db", () => ({
  db: { query: { plans: { findFirst: mocks.findPlan } } },
}));
vi.mock("@/lib/portaly", () => ({ createCheckoutSession: mocks.createCheckoutSession }));
vi.mock("@/lib/utils", () => ({ generateOrderNumber: () => "order-1" }));
vi.mock("@/lib/rate-limit", () => ({
  checkoutLimiter: { check: () => ({ success: true }) },
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/rate-limit-response", () => ({
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mocks.loggerError }),
}));
vi.mock("@/lib/request-guard", () => ({ assertSameOriginRequest: vi.fn() }));
vi.mock("@/lib/checkout-reservation", () => ({
  reserveCheckout: mocks.reserveCheckout,
  failCheckoutReservation: mocks.failCheckoutReservation,
  finalizeCheckoutReservation: mocks.finalizeCheckoutReservation,
}));
vi.mock("@/lib/event-tracking", () => ({ recordEvent: mocks.recordEvent }));

import { POST } from "./route";

const planId = "11111111-1111-4111-8111-111111111111";

function checkoutRequest(): Request {
  const body = new FormData();
  body.set("planId", planId);
  return new Request("https://learning.example.com/api/checkout", {
    method: "POST",
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordEvent.mockResolvedValue(undefined);
  vi.stubEnv("PORTALY_MODE", "test");
  vi.stubEnv("PORTALY_TEST_API_KEY", "pcs_test_example");
  vi.stubEnv("PORTALY_TEST_CALLBACK_SECRET", "matching-callback-secret");
  vi.stubEnv("PORTALY_PROFILE_ID", "profile-id");
  vi.stubEnv("PORTALY_REQUIRE_LIVE", "true");
  mocks.findPlan.mockResolvedValue({
    name: "Test plan",
    amount: 100,
    gateway: "portaly",
    slug: "test-plan",
    status: "active",
    billingPeriod: "one-time",
    pricingType: "fixed",
    currency: "TWD",
    providerPlanId: "provider-plan-1",
    purchaseButtonMode: "internal",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkout payment-mode safety", () => {
  it("blocks a sandbox checkout before reserving an order when live mode is required", async () => {
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Payment service is not configured safely.");
    expect(mocks.reserveCheckout).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Refusing to create checkout with invalid Portaly configuration",
      expect.objectContaining({ mode: "test", requireLive: true }),
    );
  });

  it("persists the provider plan snapshot and Portaly session expiry", async () => {
    vi.stubEnv("PORTALY_MODE", "live");
    vi.stubEnv("PORTALY_LIVE_API_KEY", "pcs_live_example");
    vi.stubEnv("PORTALY_LIVE_CALLBACK_SECRET", "matching-callback-secret");
    mocks.reserveCheckout.mockResolvedValue({
      kind: "new",
      orderId: "order-id-1",
      reservationExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    mocks.createCheckoutSession.mockResolvedValue({
      data: {
        sessionId: "session-1",
        checkoutUrl: "https://portaly.cc/checkout/session-1",
        checkoutToken: "checkout-token",
        expiresAt: "2099-01-01T00:30:00.000Z",
      },
      error: null,
    });
    mocks.finalizeCheckoutReservation.mockResolvedValue(true);

    await POST(checkoutRequest());

    expect(mocks.reserveCheckout).toHaveBeenCalledWith(expect.objectContaining({
      planId,
      providerPlanId: "provider-plan-1",
      providerMode: "live",
    }));
    expect(mocks.finalizeCheckoutReservation).toHaveBeenCalledWith({
      orderId: "order-id-1",
      portalySessionId: "session-1",
      checkoutUrl: "https://portaly.cc/checkout/session-1",
      checkoutSessionExpiresAt: new Date("2099-01-01T00:30:00.000Z"),
    });
  });

  it.each(["not-a-date", "2000-01-01T00:00:00.000Z"])(
    "rejects an invalid or expired Portaly session expiry: %s",
    async (expiresAt) => {
      vi.stubEnv("PORTALY_MODE", "live");
      vi.stubEnv("PORTALY_LIVE_API_KEY", "pcs_live_example");
      vi.stubEnv("PORTALY_LIVE_CALLBACK_SECRET", "matching-callback-secret");
      mocks.reserveCheckout.mockResolvedValue({
        kind: "new",
        orderId: "order-id-1",
        reservationExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      mocks.createCheckoutSession.mockResolvedValue({
        data: {
          sessionId: "session-1",
          checkoutUrl: "https://portaly.cc/checkout/session-1",
          checkoutToken: "checkout-token",
          expiresAt,
        },
        error: null,
      });

      const response = await POST(checkoutRequest());

      expect(response.status).toBe(502);
      expect(mocks.failCheckoutReservation).toHaveBeenCalledWith("order-id-1");
      expect(mocks.finalizeCheckoutReservation).not.toHaveBeenCalled();
    },
  );
});
