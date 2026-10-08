import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAgent,
  requireDestructiveConfirmation,
  createPlanSyncChangeSet,
  executePlanSync,
  getProviderSyncJob,
  readProviderSyncJob,
  createOrdersSyncChangeSet,
  createSubscriptionSyncChangeSet,
  executeOrdersSync,
  executeSubscriptionSync,
  recoverProviderSyncJob,
  recordProviderSyncAudit,
  writeRequiredAuditLog,
} = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  requireDestructiveConfirmation: vi.fn(),
  createPlanSyncChangeSet: vi.fn(),
  executePlanSync: vi.fn(),
  getProviderSyncJob: vi.fn(),
  readProviderSyncJob: vi.fn(),
  createOrdersSyncChangeSet: vi.fn(),
  createSubscriptionSyncChangeSet: vi.fn(),
  executeOrdersSync: vi.fn(),
  executeSubscriptionSync: vi.fn(),
  recoverProviderSyncJob: vi.fn(),
  recordProviderSyncAudit: vi.fn(),
  writeRequiredAuditLog: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({ requireAgent, requireDestructiveConfirmation }));
vi.mock("@/lib/provider-sync-plans", () => ({
  createPlanSyncChangeSet,
  executePlanSync,
  getProviderSyncJob,
  recordProviderSyncAudit,
}));
vi.mock("@/lib/provider-sync-operations", () => ({
  createOrdersSyncChangeSet,
  createSubscriptionSyncChangeSet,
  executeOrdersSync,
  executeSubscriptionSync,
}));
vi.mock("@/lib/provider-sync-recovery", () => ({ recoverProviderSyncJob }));
vi.mock("@/lib/provider-sync-ledger", () => ({ readProviderSyncJob, recordProviderSyncAudit }));
vi.mock("@/lib/audit", () => ({ writeRequiredAuditLog }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { GET } from "@/app/api/agent/sync/operations/[id]/route";
import { POST as execute } from "@/app/api/agent/sync/plans/route";
import { POST as preview } from "@/app/api/agent/sync/plans/preview/route";
import { POST as previewOrders } from "@/app/api/agent/sync/orders/preview/route";
import { POST as executeOrders } from "@/app/api/agent/sync/orders/route";
import { POST as previewSubscriptions } from "@/app/api/agent/sync/subscriptions/preview/route";
import { POST as executeSubscriptions } from "@/app/api/agent/sync/subscriptions/route";
import { POST as recover } from "@/app/api/agent/sync/operations/[id]/recover/route";

const job = {
  id: "9205736e-5012-40e9-a949-06a9532cbb49",
  operation: "plans" as const,
  changeSetId: "4af3d2a8-84c4-4bba-a3cd-e62721145157",
  snapshotId: "17ff9208-9e47-469d-9cb3-eb91b7b289a4",
  status: "succeeded" as const,
  attemptCount: 1,
  heartbeatAt: "2026-09-27T00:00:01.000Z",
  nextAttemptAt: "2026-09-27T00:00:00.000Z",
  synced: 4,
  result: { synced: 4 },
  auditId: null,
  errorCode: null,
  startedAt: "2026-09-27T00:00:00.000Z",
  finishedAt: "2026-09-27T00:00:01.000Z",
};

function executeRequest(overrides: { key?: string; body?: unknown } = {}) {
  return new Request("https://example.com/api/agent/sync/plans", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-confirm-destructive": "true",
      ...(overrides.key === undefined ? { "Idempotency-Key": "sync-1" } : { "Idempotency-Key": overrides.key }),
    },
    body: JSON.stringify(overrides.body ?? {
      changeSetId: "4af3d2a8-84c4-4bba-a3cd-e62721145157",
      fingerprint: "a".repeat(64),
    }),
  });
}

describe("Agent provider plan-sync contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAgent.mockResolvedValue({ agentId: "agent-key:key-1", name: "Luna" });
    requireDestructiveConfirmation.mockReturnValue(undefined);
    writeRequiredAuditLog.mockResolvedValue("a14506e1-f484-4e51-8902-e010a7b5d14e");
    recordProviderSyncAudit.mockResolvedValue(undefined);
  });

  it("creates actor-bound previews without running the sync", async () => {
    const previewResult = {
      changeSetId: "4af3d2a8-84c4-4bba-a3cd-e62721145157",
      operation: "plans",
      fingerprint: "a".repeat(64),
      counts: { create: 1, update: 2, unchanged: 1 },
      changes: [],
      externalCalls: 1,
      warnings: [],
      expiresAt: "2026-09-27T00:15:00.000Z",
    };
    createPlanSyncChangeSet.mockResolvedValue(previewResult);

    const response = await preview(new Request("https://example.com/api/agent/sync/plans/preview", { method: "POST" }));

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:sync");
    expect(createPlanSyncChangeSet).toHaveBeenCalledWith("agent-key:key-1");
    expect(executePlanSync).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: previewResult });
  });

  it("authenticates and confirms before executing with an idempotency key", async () => {
    const queuedJob = { ...job, status: "queued" as const, attemptCount: 0, heartbeatAt: null };
    executePlanSync.mockResolvedValue({ job: queuedJob, replayed: false });

    const response = await execute(executeRequest());

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:sync");
    expect(requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request));
    expect(requireDestructiveConfirmation.mock.invocationCallOrder[0]).toBeLessThan(executePlanSync.mock.invocationCallOrder[0]!);
    expect(executePlanSync).toHaveBeenCalledWith({
      actorId: "agent-key:key-1",
      agentName: "Luna",
      idempotencyKey: "sync-1",
      changeSetId: "4af3d2a8-84c4-4bba-a3cd-e62721145157",
      requestFingerprint: "a".repeat(64),
    });
    expect(writeRequiredAuditLog).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ data: { job: { status: "queued" }, replayed: false } });
  });

  it("rejects missing idempotency keys before starting the operation", async () => {
    const response = await execute(executeRequest({ key: "" }));

    expect(response.status).toBe(400);
    expect(executePlanSync).not.toHaveBeenCalled();
  });

  it("returns stale change sets as conflicts and does not write an audit for a non-execution", async () => {
    executePlanSync.mockResolvedValue({ job: { ...job, status: "stale", errorCode: "CHANGE_SET_STALE" }, replayed: false });

    const response = await execute(executeRequest());

    expect(response.status).toBe(409);
    expect(writeRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("reads back only an actor-owned sync job", async () => {
    readProviderSyncJob.mockResolvedValue({ ...job, auditId: "a14506e1-f484-4e51-8902-e010a7b5d14e" });

    const response = await GET(
      new Request(`https://example.com/api/agent/sync/operations/${job.id}`),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:read");
    expect(response.status).toBe(200);
    expect(readProviderSyncJob).toHaveBeenCalledWith(job.id, "agent-key:key-1");
    await expect(response.json()).resolves.toMatchObject({ data: { job: { id: job.id } } });
  });

  it.each([
    ["orders", previewOrders, createOrdersSyncChangeSet],
    ["subscriptions", previewSubscriptions, createSubscriptionSyncChangeSet],
  ])("previews %s without executing or requiring destructive confirmation", async (name, route, createChangeSet) => {
    const previewResult = {
      changeSetId: job.changeSetId,
      operation: name,
      fingerprint: "a".repeat(64),
      counts: { scanned: 1, updated: 1 },
      changes: [],
      externalCalls: 1,
      warnings: [],
      expiresAt: "2026-09-27T00:15:00.000Z",
    };
    vi.mocked(createChangeSet).mockResolvedValue(previewResult);
    const response = await route(new Request(`https://example.com/api/agent/sync/${name}/preview`, { method: "POST" }));
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:sync");
    expect(requireDestructiveConfirmation).not.toHaveBeenCalled();
    expect(createChangeSet).toHaveBeenCalledWith("agent-key:key-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: previewResult });
  });

  it.each([
    ["orders", executeOrders, executeOrdersSync],
    ["subscriptions", executeSubscriptions, executeSubscriptionSync],
 ])("executes %s change sets with explicit confirmation and idempotency", async (name, route, executeSync) => {
    const queuedJob = { ...job, operation: name, status: "queued" as const, attemptCount: 0, heartbeatAt: null };
    vi.mocked(executeSync).mockResolvedValue({ job: queuedJob, replayed: false });
    const response = await route(executeRequest());
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:sync");
    expect(requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request));
    expect(executeSync).toHaveBeenCalledWith({
      actorId: "agent-key:key-1",
      agentName: "Luna",
      idempotencyKey: "sync-1",
      changeSetId: job.changeSetId,
      requestFingerprint: "a".repeat(64),
    });
    expect(writeRequiredAuditLog).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
  });

  it("recovers only actor-owned jobs with confirmation and a recovery idempotency key", async () => {
    recoverProviderSyncJob.mockResolvedValue({ job: { ...job, status: "recovered" }, replayed: false, restored: 2 });
    const request = new Request(`https://example.com/api/agent/sync/operations/${job.id}/recover`, {
      method: "POST",
      headers: {
        "x-confirm-destructive": "true",
        "x-confirm-entity-id": job.id,
        "Idempotency-Key": "recover-1",
      },
    });
    const response = await recover(request, { params: Promise.resolve({ id: job.id }) });
    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:sync");
    expect(requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request), job.id);
    expect(recoverProviderSyncJob).toHaveBeenCalledWith({
      jobId: job.id,
      actorId: "agent-key:key-1",
      agentName: "Luna",
      idempotencyKey: "recover-1",
    });
    expect(writeRequiredAuditLog).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("rejects recovery confirmation bound to a different job id", async () => {
    requireDestructiveConfirmation.mockImplementation((request: Request, expectedEntityId?: string) => {
      if (request.headers.get("x-confirm-destructive") !== "true"
        || request.headers.get("x-confirm-entity-id") !== expectedEntityId) {
        throw new Response(JSON.stringify({ error: "confirmation does not match target" }), { status: 428 });
      }
    });
    const request = new Request(`https://example.com/api/agent/sync/operations/${job.id}/recover`, {
      method: "POST",
      headers: {
        "x-confirm-destructive": "true",
        "x-confirm-entity-id": "different-job",
        "Idempotency-Key": "recover-2",
      },
    });

    const response = await recover(request, { params: Promise.resolve({ id: job.id }) });

    expect(response.status).toBe(428);
    expect(requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request), job.id);
    expect(recoverProviderSyncJob).not.toHaveBeenCalled();
  });
});
