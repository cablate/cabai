import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AgentAuthModule from "@/lib/agent-auth";

const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  createAgentGrant: vi.fn(),
  revokeAgentGrant: vi.fn(),
  retryAgentWebhook: vi.fn(),
  executePlanSync: vi.fn(),
  recoverProviderSyncJob: vi.fn(),
  recordProviderSyncAudit: vi.fn(),
  writeRequiredAuditLog: vi.fn(),
}));

vi.mock("@/lib/agent-auth", async () => {
  const actual = await vi.importActual<typeof AgentAuthModule>("@/lib/agent-auth");
  return { ...actual, requireAgent: mocks.requireAgent };
});
vi.mock("@/lib/services/agent-operations-service", () => ({
  createAgentGrant: mocks.createAgentGrant,
  listAgentGrants: vi.fn(),
  revokeAgentGrant: mocks.revokeAgentGrant,
  retryAgentWebhook: mocks.retryAgentWebhook,
}));
vi.mock("@/lib/provider-sync-plans", () => ({
  createPlanSyncChangeSet: vi.fn(),
  executePlanSync: mocks.executePlanSync,
  getProviderSyncJob: vi.fn(),
  recordProviderSyncAudit: mocks.recordProviderSyncAudit,
}));
vi.mock("@/lib/provider-sync-operations", () => ({
  createOrdersSyncChangeSet: vi.fn(),
  createSubscriptionSyncChangeSet: vi.fn(),
  executeOrdersSync: vi.fn(),
  executeSubscriptionSync: vi.fn(),
}));
vi.mock("@/lib/provider-sync-recovery", () => ({ recoverProviderSyncJob: mocks.recoverProviderSyncJob }));
vi.mock("@/lib/audit", () => ({ writeRequiredAuditLog: mocks.writeRequiredAuditLog }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { DELETE as revokeGrant, POST as createGrant } from "@/app/api/agent/grants/route";
import { POST as retryWebhook } from "@/app/api/agent/webhooks/retry/route";
import { POST as executePlanSync } from "@/app/api/agent/sync/plans/route";
import { POST as recoverProviderSync } from "@/app/api/agent/sync/operations/[id]/recover/route";

const changeSetId = "4af3d2a8-84c4-4bba-a3cd-e62721145157";
const jobId = "9205736e-5012-40e9-a949-06a9532cbb49";

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("high-risk Agent mutation guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgent.mockResolvedValue({ agentId: "agent-guard-test", name: "Guard test agent" });
  });

  it("rejects a grant confirmation bound to a different user-plan pair", async () => {
    const response = await createGrant(jsonRequest("/api/agent/grants", {
      userId: "user-1",
      planId: "plan-1",
    }, {
      "idempotency-key": "grant-negative-1",
      "x-confirm-destructive": "true",
      "x-confirm-entity-id": "user-2:plan-1",
    }));

    expect(response.status).toBe(428);
    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "entitlements:write");
    expect(mocks.createAgentGrant).not.toHaveBeenCalled();
  });

  it("rejects a grant-revocation confirmation bound to a different purchase", async () => {
    const response = await revokeGrant(jsonRequest("/api/agent/grants", {
      purchaseId: "purchase-1",
    }, {
      "x-confirm-destructive": "true",
      "x-confirm-entity-id": "purchase-2",
    }));

    expect(response.status).toBe(428);
    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "entitlements:write");
    expect(mocks.revokeAgentGrant).not.toHaveBeenCalled();
  });

  it("rejects a webhook retry without destructive confirmation before dispatch", async () => {
    const response = await retryWebhook(jsonRequest("/api/agent/webhooks/retry", {
      logId: "webhook-1",
    }, { "idempotency-key": "webhook-negative-1" }));

    expect(response.status).toBe(428);
    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "webhooks:retry");
    expect(mocks.retryAgentWebhook).not.toHaveBeenCalled();
  });

  it("rejects a webhook retry confirmation bound to a different log", async () => {
    const response = await retryWebhook(jsonRequest("/api/agent/webhooks/retry", {
      logId: "webhook-1",
    }, {
      "idempotency-key": "webhook-negative-entity",
      "x-confirm-destructive": "true",
      "x-confirm-entity-id": "webhook-2",
    }));

    expect(response.status).toBe(428);
    expect(mocks.retryAgentWebhook).not.toHaveBeenCalled();
  });

  it("rejects sync execution and recovery without confirmation before recording or running either operation", async () => {
    const execute = await executePlanSync(jsonRequest("/api/agent/sync/plans", {
      changeSetId,
      fingerprint: "a".repeat(64),
    }, { "Idempotency-Key": "sync-negative-1" }));
    const recovery = await recoverProviderSync(
      jsonRequest(`/api/agent/sync/operations/${jobId}/recover`, {}, { "Idempotency-Key": "recover-negative-1" }),
      { params: Promise.resolve({ id: jobId }) },
    );

    expect(execute.status).toBe(428);
    expect(recovery.status).toBe(428);
    expect(mocks.executePlanSync).not.toHaveBeenCalled();
    expect(mocks.recoverProviderSyncJob).not.toHaveBeenCalled();
    expect(mocks.writeRequiredAuditLog).not.toHaveBeenCalled();
  });
});
