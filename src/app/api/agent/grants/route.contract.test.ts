import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AgentAuthModule from "@/lib/agent-auth";

const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  createAgentGrant: vi.fn(),
}));

vi.mock("@/lib/agent-auth", async () => {
  const actual = await vi.importActual<typeof AgentAuthModule>("@/lib/agent-auth");
  return { ...actual, requireAgent: mocks.requireAgent };
});
vi.mock("@/lib/services/agent-operations-service", () => ({
  createAgentGrant: mocks.createAgentGrant,
  listAgentGrants: vi.fn(),
  revokeAgentGrant: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { POST } from "./route";

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/agent/grants", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ userId: "user-1", planId: "plan-1" }),
  });
}

describe("create grant safety contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgent.mockResolvedValue({ agentId: "agent-1", name: "Admin agent" });
    mocks.createAgentGrant.mockResolvedValue({ kind: "created", data: { id: "purchase-1" } });
  });

  it("requires entity-bound confirmation before granting access", async () => {
    const response = await POST(request({ "idempotency-key": "grant-1" }));
    expect(response.status).toBe(428);
    expect(mocks.createAgentGrant).not.toHaveBeenCalled();
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request({ "x-confirm-destructive": "true", "x-confirm-entity-id": "user-1:plan-1" }));
    expect(response.status).toBe(400);
    expect(mocks.createAgentGrant).not.toHaveBeenCalled();
  });

  it("forwards safety identity and can replay the original grant", async () => {
    mocks.createAgentGrant.mockResolvedValue({ kind: "replayed", data: { id: "purchase-1", auditId: "audit-1" } });
    const response = await POST(request({
      "x-confirm-destructive": "true",
      "x-confirm-entity-id": "user-1:plan-1",
      "idempotency-key": "grant-1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createAgentGrant).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "grant-1" }));
    await expect(response.json()).resolves.toEqual({ data: { id: "purchase-1", auditId: "audit-1", replayed: true } });
  });
});
