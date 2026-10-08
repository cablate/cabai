import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminAction = vi.fn();
const syncPlans = vi.fn();

vi.mock("@/lib/admin-action-guard", () => ({
  requireAdminAction,
  AdminActionRateLimitError: class AdminActionRateLimitError extends Error {},
}));
vi.mock("@/lib/sync-plans", () => ({ syncPlans }));
vi.mock("@/lib/request-guard", () => ({ assertSameOriginRequest: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

const { POST } = await import("@/app/api/admin/sync-plans/route");

describe("admin operation route foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  });

  it("preserves success envelope and adds request correlation", async () => {
    syncPlans.mockResolvedValue({ synced: 3 });
    const response = await POST(new Request("https://example.com/api/admin/sync-plans", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ synced: 3 });
  });

  it("normalizes unexpected failures without exposing provider details", async () => {
    syncPlans.mockRejectedValue(new Error("provider token secret"));
    const response = await POST(new Request("https://example.com/api/admin/sync-plans", { method: "POST" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Server error" });
  });
});
