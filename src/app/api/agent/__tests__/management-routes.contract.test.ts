import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAgent, parseAgentLimit, listAgentMembers, listAgentOrders, createAgentGrant, listAgentGrants } = vi.hoisted(() => ({
  requireAgent: vi.fn(), parseAgentLimit: vi.fn(), listAgentMembers: vi.fn(), listAgentOrders: vi.fn(), createAgentGrant: vi.fn(), listAgentGrants: vi.fn(),
}));
vi.mock("@/lib/agent-auth", () => ({ requireAgent, parseAgentLimit, requireDestructiveConfirmation: vi.fn() }));
vi.mock("@/lib/services/agent-operations-service", () => ({ listAgentMembers, listAgentOrders, createAgentGrant, listAgentGrants, revokeAgentGrant: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }));

import { GET as members } from "@/app/api/agent/members/route";
import { GET as orders } from "@/app/api/agent/orders/route";
import { GET as grants, POST as grant } from "@/app/api/agent/grants/route";

describe("Agent management route contract", () => {
  beforeEach(() => { vi.clearAllMocks(); requireAgent.mockResolvedValue({ agentId: "agent-1", name: "Luna" }); parseAgentLimit.mockReturnValue(50); });
  it("preserves member scope, query forwarding and data envelope", async () => {
    listAgentMembers.mockResolvedValue([{ id: "user-1" }]);
    const response = await members(new Request("https://example.com/api/agent/members?planId=plan-1&limit=12"));
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "members:read");
    expect(listAgentMembers).toHaveBeenCalledWith({ planId: "plan-1", limit: 50, actor: { agentId: "agent-1", name: "Luna" } });
    await expect(response.json()).resolves.toEqual({ data: [{ id: "user-1" }] });
  });
  it("preserves order stats query and envelope", async () => {
    listAgentOrders.mockResolvedValue({ totalOrders: 2, totalRevenue: 300 });
    const response = await orders(new Request("https://example.com/api/agent/orders?stats=true&status=completed"));
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "orders:read");
    expect(listAgentOrders).toHaveBeenCalledWith(expect.objectContaining({ statsOnly: true, status: "completed" }));
    await expect(response.json()).resolves.toEqual({ data: { totalOrders: 2, totalRevenue: 300 } });
  });
  it("validates grant input before entering the service", async () => {
    const response = await grant(new Request("https://example.com/api/agent/grants", { method: "POST", body: "{}" }));
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "entitlements:write");
    expect(response.status).toBe(400);
    expect(createAgentGrant).not.toHaveBeenCalled();
  });
  it("preserves required userId validation for grant listing", async () => {
    const response = await grants(new Request("https://example.com/api/agent/grants"));
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "members:read");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required query param: userId" });
  });
});
