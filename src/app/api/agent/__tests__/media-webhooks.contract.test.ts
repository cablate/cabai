import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAgent, requireDestructiveConfirmation, parseAgentLimit } =
  vi.hoisted(() => ({
    requireAgent: vi.fn(),
    requireDestructiveConfirmation: vi.fn(),
    parseAgentLimit: vi.fn(),
  }));
const { listAgentMedia, retryAgentWebhook } = vi.hoisted(() => ({
  listAgentMedia: vi.fn(),
  retryAgentWebhook: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({
  requireAgent,
  requireDestructiveConfirmation,
  parseAgentLimit,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/services/agent-operations-service", () => ({
  listAgentMedia,
  retryAgentWebhook,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

import { GET as listMedia } from "@/app/api/agent/media/route";
import { POST as retryWebhook } from "@/app/api/agent/webhooks/retry/route";

describe("Agent media and webhook route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAgent.mockResolvedValue({ agentId: "agent-key:key-1" });
    parseAgentLimit.mockReturnValue(50);
  });

  it("preserves media read scope and invalid-offset envelope", async () => {
    const response = await listMedia(
      new Request("https://example.com/api/agent/media?offset=-1"),
    );

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "content:read");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid offset: expected non-negative integer",
    });
  });

  it("validates webhook retry body before destructive confirmation", async () => {
    const response = await retryWebhook(
      new Request("https://example.com/api/agent/webhooks/retry", {
        method: "POST",
        body: "{broken",
      }),
    );

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "webhooks:retry");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request" });
    expect(requireDestructiveConfirmation).not.toHaveBeenCalled();
  });

  it("maps a typed webhook retry outcome without changing the envelope", async () => {
    retryAgentWebhook.mockResolvedValue({
      kind: "result",
      data: {
        id: "log-1",
        eventType: "entitlement.granted",
        serviceConfigId: "service-1",
        idempotencyKey: "delivery-1",
        auditId: "audit-1",
      },
      replayed: false,
    });
    const response = await retryWebhook(new Request("https://example.com/api/agent/webhooks/retry", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "retry-1" },
      body: JSON.stringify({ logId: "log-1" }),
    }));
    expect(requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request), "log-1");
    expect(retryAgentWebhook).toHaveBeenCalledWith("log-1", { agentId: "agent-key:key-1" }, "retry-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { requeued: true, logId: "log-1", eventType: "entitlement.granted", auditId: "audit-1", replayed: false } });
  });

  it("requires an idempotency key before dispatching a webhook retry", async () => {
    const response = await retryWebhook(new Request("https://example.com/api/agent/webhooks/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logId: "log-1" }),
    }));

    expect(response.status).toBe(400);
    expect(retryAgentWebhook).not.toHaveBeenCalled();
  });

  it("returns the original result on replay and conflicts on key reuse with a different payload", async () => {
    retryAgentWebhook.mockResolvedValueOnce({
      kind: "result",
      data: { id: "log-1", eventType: "entitlement.granted", serviceConfigId: "service-1", idempotencyKey: "delivery-1", auditId: "audit-1" },
      replayed: true,
    });
    const replay = await retryWebhook(new Request("https://example.com/api/agent/webhooks/retry", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "retry-1" },
      body: JSON.stringify({ logId: "log-1" }),
    }));
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ data: { logId: "log-1", auditId: "audit-1", replayed: true } });

    retryAgentWebhook.mockResolvedValueOnce({ kind: "conflict" });
    const conflict = await retryWebhook(new Request("https://example.com/api/agent/webhooks/retry", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "retry-1" },
      body: JSON.stringify({ logId: "log-2" }),
    }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: expect.stringContaining("Idempotency-Key") });
  });
});
