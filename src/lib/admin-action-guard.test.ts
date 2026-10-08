import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), check: vi.fn(() => ({ success: true })) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...await original<Record<string, unknown>>(),
  createRateLimiter: () => ({ check: mocks.check }),
}));
import { requireAdminAction } from "./admin-action-guard";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("admin action shares trusted ingress policy", () => {
  it("does not reset the admin action bucket by rotating spoofed forwarding headers", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    for (const address of ["1.1.1.1", "2.2.2.2"]) {
      mocks.headers.mockResolvedValue(new Headers({ "cf-connecting-ip": address, "x-forwarded-for": address }));
      await requireAdminAction("save");
    }
    expect(mocks.check.mock.calls).toEqual([["admin-1:unknown:save"], ["admin-1:unknown:save"]]);
  });
});
