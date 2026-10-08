import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findOrder, getCheckoutSession } = vi.hoisted(() => ({
  auth: vi.fn(),
  findOrder: vi.fn(),
  getCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({
  db: { query: { orders: { findFirst: findOrder } } },
}));
vi.mock("@/lib/portaly", () => ({ getCheckoutSession }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

import { GET } from "@/app/api/sessions/[id]/route";

function request() {
  return new Request("https://example.com/api/sessions/session-1");
}

function context() {
  return { params: Promise.resolve({ id: "session-1" }) };
}

describe("Commerce read route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated callers before ownership/provider checks", async () => {
    auth.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(findOrder).not.toHaveBeenCalled();
    expect(getCheckoutSession).not.toHaveBeenCalled();
  });

  it("preserves owned-session provider response envelope", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    findOrder.mockResolvedValue({ id: "order-1" });
    getCheckoutSession.mockResolvedValue({ data: { status: "completed" } });

    const response = await GET(request(), context());

    expect(getCheckoutSession).toHaveBeenCalledWith("session-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: "completed" },
    });
  });
});
