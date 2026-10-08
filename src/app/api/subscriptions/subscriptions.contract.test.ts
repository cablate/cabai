import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const findOrder = vi.fn();
const getSubscription = vi.fn();
const cancelSubscription = vi.fn();
const resumeSubscription = vi.fn();
const reconcileOrderSubscriptionState = vi.fn();

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db: { query: { orders: { findFirst: findOrder } } } }));
vi.mock("@/lib/db/schema", () => ({ orders: { subscriptionId: "subscriptionId", userId: "userId" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((...args) => args), and: vi.fn((...args) => args) }));
vi.mock("@/lib/portaly", () => ({ getSubscription, cancelSubscription, resumeSubscription }));
vi.mock("@/lib/entitlement-transitions", () => ({ reconcileOrderSubscriptionState }));
vi.mock("@/lib/request-guard", () => ({ assertSameOriginRequest: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: { check: () => ({ success: true }) },
  checkoutLimiter: { check: () => ({ success: true }) },
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

const { GET } = await import("@/app/api/subscriptions/[id]/route");
const { POST: cancel } = await import("@/app/api/subscriptions/[id]/cancel/route");
const { POST: resume } = await import("@/app/api/subscriptions/[id]/resume/route");
const context = { params: Promise.resolve({ id: "sub-1" }) };

describe("subscription route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "user-1" } });
    findOrder.mockResolvedValue({ id: "order-1" });
    reconcileOrderSubscriptionState.mockResolvedValue({ changed: true });
  });

  it("checks ownership before reading the provider subscription", async () => {
    findOrder.mockResolvedValue(null);
    const response = await GET(new Request("https://example.com/api/subscriptions/sub-1"), context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Subscription not found" });
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it("does not mutate local cancellation state when the provider fails", async () => {
    cancelSubscription.mockResolvedValue({ data: null, error: "Provider unavailable" });
    const response = await cancel(
      new Request("https://example.com/api/subscriptions/sub-1/cancel", { method: "POST", body: "{}" }),
      context,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Provider unavailable" });
    expect(reconcileOrderSubscriptionState).not.toHaveBeenCalled();
  });

  it("writes the provider cancellation fields only after success", async () => {
    cancelSubscription.mockResolvedValue({
      data: {
        status: "active",
        cancelAtPeriodEnd: true,
        nextBillingAt: "2026-08-01T00:00:00.000Z",
      },
      error: null,
    });
    const response = await cancel(
      new Request("https://example.com/api/subscriptions/sub-1/cancel", { method: "POST", body: "{}" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(reconcileOrderSubscriptionState).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-1",
      orderChanges: expect.objectContaining({
        subscriptionStatus: "active",
        cancelAtPeriodEnd: true,
        cancelEffectiveAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    }));
  });

  it("does not clear cancellation flags when resume fails", async () => {
    resumeSubscription.mockResolvedValue({ data: null, error: "Cannot resume" });
    const response = await resume(
      new Request("https://example.com/api/subscriptions/sub-1/resume", { method: "POST" }),
      context,
    );
    expect(response.status).toBe(400);
    expect(reconcileOrderSubscriptionState).not.toHaveBeenCalled();
  });
});
