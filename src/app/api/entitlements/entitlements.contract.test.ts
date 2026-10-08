import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyServiceKey = vi.fn();
const findUser = vi.fn();
const findPlan = vi.fn();
const findPurchase = vi.fn();
const findOrder = vi.fn();
const checkPlanAccess = vi.fn();

vi.mock("@/lib/webhook-verify", () => ({ verifyServiceKey }));
vi.mock("@/lib/access", () => ({ checkPlanAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: findUser },
      plans: { findFirst: findPlan },
      userPurchases: { findFirst: findPurchase },
      orders: { findFirst: findOrder },
    },
  },
}));
vi.mock("@/lib/db/schema", () => ({
  users: { email: "email" }, plans: { id: "id" }, orders: { id: "id" }, userPurchases: { userId: "userId", planId: "planId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args) => args), and: vi.fn((...args) => args), sql: vi.fn(),
  isNull: vi.fn(), or: vi.fn(), gte: vi.fn(), inArray: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  entitlementLimiter: { check: () => ({ success: true }) },
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

const { GET: check } = await import("@/app/api/entitlements/check/route");
const { GET: list } = await import("@/app/api/entitlements/list/route");

describe("entitlement route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyServiceKey.mockResolvedValue({ id: "service-1" });
    findPlan.mockResolvedValue({ name: "Agent Course" });
  });

  it("preserves query, service-key and plan-binding error envelopes", async () => {
    const missingQuery = await check(new Request("https://example.com/api/entitlements/check"));
    expect(missingQuery.status).toBe(400);
    await expect(missingQuery.json()).resolves.toEqual({ error: "Missing email or plan_id query parameter" });

    const missingKey = await list(new Request("https://example.com/api/entitlements/list?plan_id=plan-1"));
    expect(missingKey.status).toBe(401);
    await expect(missingKey.json()).resolves.toEqual({ error: "Missing x-service-key header" });

    verifyServiceKey.mockResolvedValue(null);
    const mismatch = await check(new Request(
      "https://example.com/api/entitlements/check?email=user%40example.com&plan_id=plan-1",
      { headers: { "x-service-key": "wrong" } },
    ));
    expect(mismatch.status).toBe(403);
    await expect(mismatch.json()).resolves.toEqual({ error: "Invalid service key or plan mismatch" });
  });

  it("keeps no-account and inactive-user denial responses enumeration-resistant", async () => {
    const request = () => new Request(
      "https://example.com/api/entitlements/check?email=user%40example.com&plan_id=plan-1",
      { headers: { "x-service-key": "valid" } },
    );
    findUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user-1" });
    checkPlanAccess.mockResolvedValue({ hasAccess: false });

    const noAccount = await check(request());
    const inactive = await check(request());
    const noAccountBody = await noAccount.json();
    const inactiveBody = await inactive.json();
    expect(noAccountBody).toEqual(inactiveBody);
    expect(inactiveBody).toEqual({
      has_access: false,
      source: null,
      status: "inactive",
      expires_at: null,
      cancel_at_period_end: false,
      plan_name: "Agent Course",
    });
  });
});
