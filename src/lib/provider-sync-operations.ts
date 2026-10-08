import type { ProviderSyncPreviewData } from "@/lib/provider-sync-ledger";
import { enqueueProviderSyncJob, persistProviderSyncChangeSet } from "@/lib/provider-sync-ledger";
import {
  analyzePortalyOrderRebuild,
  analyzeSubscriptionReconciliation,
  prepareOrdersSync,
  prepareSubscriptionSync,
  type ProviderSyncAnalysis,
} from "@/lib/provider-sync-analysis";
import { rebuildOrdersFromPortaly, type PortalyRebuildSnapshot } from "@/lib/rebuild-orders";
import { runSubscriptionReconciliation, type SubscriptionProviderSnapshot } from "@/lib/reconcile-subscriptions";
import { providerSyncStateFingerprint } from "@/lib/provider-sync-ledger";

function previewData(analysis: ProviderSyncAnalysis): ProviderSyncPreviewData {
  return {
    operation: analysis.operation,
    sourceFingerprint: analysis.sourceFingerprint,
    fingerprint: analysis.fingerprint,
    counts: analysis.counts,
    changes: analysis.changes.map((change) => ({ ...change })),
    externalCalls: analysis.externalCalls,
    warnings: analysis.warnings,
  };
}

export async function createOrdersSyncChangeSet(actorId: string) {
  return persistProviderSyncChangeSet(actorId, previewData(await analyzePortalyOrderRebuild()));
}

export async function createSubscriptionSyncChangeSet(actorId: string) {
  return persistProviderSyncChangeSet(actorId, previewData(await analyzeSubscriptionReconciliation()));
}

type EnqueueInput = {
  actorId: string;
  agentName: string;
  idempotencyKey: string;
  changeSetId: string;
  requestFingerprint: string;
};

export async function executeOrdersSync(input: EnqueueInput) {
  return enqueueProviderSyncJob({ ...input, operation: "orders" });
}

export async function executeSubscriptionSync(input: EnqueueInput) {
  return enqueueProviderSyncJob({ ...input, operation: "subscriptions" });
}

export async function prepareOrdersSyncForRunner(): Promise<ProviderSyncAnalysis> {
  return prepareOrdersSync();
}

export async function prepareSubscriptionSyncForRunner(): Promise<ProviderSyncAnalysis> {
  return prepareSubscriptionSync();
}

export async function analyzeOrdersSnapshot(snapshot: PortalyRebuildSnapshot): Promise<ProviderSyncAnalysis> {
  return analyzePortalyOrderRebuild(snapshot);
}

export async function analyzeSubscriptionSnapshot(snapshot: SubscriptionProviderSnapshot): Promise<ProviderSyncAnalysis> {
  return analyzeSubscriptionReconciliation(snapshot);
}

export async function applyOrdersSyncSnapshot(input: {
  analysis: ProviderSyncAnalysis;
  jobId: string;
  resumed: boolean;
}) {
  const snapshot = input.analysis.providerSnapshot as PortalyRebuildSnapshot;
  const result = await rebuildOrdersFromPortaly(snapshot, {
    triggeredBy: `provider-sync:${input.jobId}`,
    ...(!input.resumed ? {
      ensureFresh: async () => (await analyzePortalyOrderRebuild(snapshot)).fingerprint === input.analysis.fingerprint,
    } : {}),
    capturePostState: () => providerSyncStateFingerprint("orders"),
  });
  return {
    synced: result.ordersCreated + result.ordersUpdated + result.purchasesCreated + result.subscriptionsUpdated + result.subscriptionsRevoked,
    result: { ...result, errors: result.errors.slice(0, 50) },
    partialFailure: result.errors.length > 0,
    stale: result.stale,
    postStateFingerprint: result.postStateFingerprint,
  };
}

export async function applySubscriptionSyncSnapshot(input: {
  analysis: ProviderSyncAnalysis;
  jobId: string;
  resumed: boolean;
}) {
  const snapshot = input.analysis.providerSnapshot as SubscriptionProviderSnapshot;
  const result = await runSubscriptionReconciliation(snapshot, {
    triggeredBy: `provider-sync:${input.jobId}`,
    ...(!input.resumed ? {
      ensureFresh: async () => (await analyzeSubscriptionReconciliation(snapshot)).fingerprint === input.analysis.fingerprint,
    } : {}),
    capturePostState: () => providerSyncStateFingerprint("subscriptions"),
  });
  return {
    synced: result.updated + result.revoked + result.staleCleanedUp + result.orphansRepaired,
    result: { ...result },
    partialFailure: result.errors > 0,
    stale: result.stale,
    postStateFingerprint: result.postStateFingerprint,
  };
}
