import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  heartbeat: vi.fn(),
  finalize: vi.fn(),
  requeue: vi.fn(),
  readSnapshot: vi.fn(),
  persistSnapshot: vi.fn(),
  serializeSnapshot: vi.fn(),
  findChangeSet: vi.fn(),
  findJob: vi.fn(),
  applyPlans: vi.fn(),
  applyOrders: vi.fn(),
  applySubscriptions: vi.fn(),
  analyzeOrders: vi.fn(),
  analyzeSubscriptions: vi.fn(),
  preparePlans: vi.fn(),
  prepareOrders: vi.fn(),
  prepareSubscriptions: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { query: {
    providerSyncChangeSets: { findFirst: mocks.findChangeSet },
    providerSyncJobs: { findFirst: mocks.findJob },
  } },
}));
vi.mock("@/lib/backup-guard", () => ({ requireSnapshotBefore: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/provider-sync-operations", () => ({
  analyzeOrdersSnapshot: mocks.analyzeOrders,
  analyzeSubscriptionSnapshot: mocks.analyzeSubscriptions,
  applyOrdersSyncSnapshot: mocks.applyOrders,
  applySubscriptionSyncSnapshot: mocks.applySubscriptions,
  prepareOrdersSyncForRunner: mocks.prepareOrders,
  prepareSubscriptionSyncForRunner: mocks.prepareSubscriptions,
}));
vi.mock("@/lib/provider-sync-plans", () => ({
  applyPlanSyncSnapshot: mocks.applyPlans,
  preparePlanSyncForRunner: mocks.preparePlans,
}));
vi.mock("@/lib/provider-sync-ledger", () => ({
  claimProviderSyncJob: mocks.claim,
  finalizeProviderSyncJob: mocks.finalize,
  heartbeatProviderSyncJob: mocks.heartbeat,
  PROVIDER_SYNC_MAX_ATTEMPTS: 5,
  ProviderSyncLeaseLostError: class ProviderSyncLeaseLostError extends Error {},
  readProviderSyncSnapshot: mocks.readSnapshot,
  requeueOrFailProviderSyncJob: mocks.requeue,
  serializeProviderSyncSnapshot: mocks.serializeSnapshot,
  persistProviderSyncExecutionSnapshot: mocks.persistSnapshot,
}));

import { runProviderSyncBatch } from "@/lib/provider-sync-runner";
import type { ProviderSyncJob } from "@/lib/provider-sync-ledger";

function job(operation: ProviderSyncJob["operation"]): ProviderSyncJob {
  const now = new Date();
  return {
    id: "9205736e-5012-40e9-a949-06a9532cbb49",
    operation,
    actorId: "agent-key:test",
    idempotencyKeyHash: "key-hash",
    recoveryKeyHash: null,
    changeSetId: "4af3d2a8-84c4-4bba-a3cd-e62721145157",
    requestFingerprint: "request-fingerprint",
    snapshotId: "17ff9208-9e47-469d-9cb3-eb91b7b289a4",
    providerSnapshot: { version: 1, operation, payload: { durable: true } },
    status: "running",
    attemptCount: 1,
    leaseOwner: "worker-1",
    leaseExpiresAt: new Date(now.getTime() + 120_000),
    heartbeatAt: now,
    nextAttemptAt: now,
    synced: null,
    result: null,
    auditId: null,
    errorCode: null,
    startedAt: now,
    finishedAt: null,
  };
}

describe("provider-sync runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.heartbeat.mockResolvedValue(true);
    mocks.findChangeSet.mockResolvedValue({ fingerprint: "request-fingerprint", expiresAt: new Date(Date.now() + 60_000) });
    mocks.readSnapshot.mockReturnValue({ durable: true });
  });

  it.each(["plans", "orders", "subscriptions"] as const)("resumes a durable %s provider snapshot through its domain apply path", async (operation) => {
    mocks.claim.mockResolvedValueOnce({ job: job(operation), leaseOwner: "worker-1" }).mockResolvedValueOnce(null);
    const durablePayload = operation === "plans"
      ? [{ id: "plan-1", name: "Plan", amount: 100, currency: "USD", createdAt: "2026-01-01", updatedAt: "2026-01-01", billingPeriod: "monthly", status: "active" }]
      : operation === "orders"
        ? { providerMode: null, orders: [], subscriptions: [], externalCalls: 0 }
        : { bySubscriptionId: {}, externalCalls: 0 };
    mocks.readSnapshot.mockReturnValue(durablePayload);
    if (operation === "plans") {
      mocks.applyPlans.mockResolvedValue({ job: { status: "succeeded" }, terminal: true });
    } else if (operation === "orders") {
      mocks.analyzeOrders.mockResolvedValue({ analysis: true });
      mocks.applyOrders.mockResolvedValue({
        job: { status: "succeeded" },
        terminal: true,
        stale: false,
        partialFailure: false,
        synced: 2,
        result: {},
        postStateFingerprint: "post-state",
      });
      mocks.finalize.mockResolvedValue({ status: "succeeded" });
    } else {
      mocks.analyzeSubscriptions.mockResolvedValue({ analysis: true });
      mocks.applySubscriptions.mockResolvedValue({
        job: { status: "succeeded" },
        terminal: true,
        stale: false,
        partialFailure: false,
        synced: 2,
        result: {},
        postStateFingerprint: "post-state",
      });
      mocks.finalize.mockResolvedValue({ status: "succeeded" });
    }

    const result = await runProviderSyncBatch(1);

    expect(result).toEqual({
      claimed: 1,
      succeeded: 1,
      partiallyFailed: 0,
      failed: 0,
      requeued: 0,
      leaseLost: 0,
    });
    expect(mocks.readSnapshot).toHaveBeenCalledWith(operation, expect.objectContaining({ operation }));
    if (operation === "plans") {
      expect(mocks.applyPlans).toHaveBeenCalledWith(expect.objectContaining({ jobId: job(operation).id, leaseOwner: "worker-1" }));
    } else if (operation === "orders") {
      expect(mocks.analyzeOrders).toHaveBeenCalledWith(durablePayload);
      expect(mocks.applyOrders).toHaveBeenCalledWith(expect.objectContaining({ jobId: job(operation).id, resumed: true }));
    } else {
      expect(mocks.analyzeSubscriptions).toHaveBeenCalledWith(durablePayload);
      expect(mocks.applySubscriptions).toHaveBeenCalledWith(expect.objectContaining({ jobId: job(operation).id, resumed: true }));
    }
    expect(mocks.preparePlans).not.toHaveBeenCalled();
    expect(mocks.prepareOrders).not.toHaveBeenCalled();
    expect(mocks.prepareSubscriptions).not.toHaveBeenCalled();
  });
});
