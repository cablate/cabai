import { runScheduledBackup } from "@/lib/backup";
import { cleanupOrphanedMedia } from "@/lib/media-cleanup";
import { processPendingWebhooks } from "@/lib/webhook-processor";
import { processPendingEntitlementOutbox } from "@/lib/entitlement-outbox-processor";
import { runSubscriptionReconciliation } from "@/lib/reconcile-subscriptions";
import { cleanupExpiredOrders } from "./cleanup-orders";
import { runProviderSyncBatch } from "@/lib/provider-sync-runner";
import type { JobId } from "./ids";

export { jobIds } from "./ids";
export type { JobId } from "./ids";

export const jobs: Record<JobId, (input?: Record<string, unknown>) => Promise<unknown>> = {
  "database-backup": () => runScheduledBackup(),
  "cleanup-orders": () => cleanupExpiredOrders(),
  "media-cleanup": () => cleanupOrphanedMedia(),
  "webhook-outbox": async (input) => {
    const limit = typeof input?.limit === "number" ? input.limit : undefined;
    // First fan out durable entitlement transitions, then deliver any webhook
    // rows they created in the same scheduled run.
    const transitions = await processPendingEntitlementOutbox({ limit });
    const webhooks = await processPendingWebhooks({ limit });
    return {
      scanned: transitions.scanned + webhooks.scanned,
      claimed: transitions.claimed + webhooks.claimed,
      processed: transitions.processed + webhooks.processed,
      sent: webhooks.sent,
      delivered: transitions.delivered,
      failed: transitions.failed + webhooks.failed,
      deadLetter: transitions.deadLetter + webhooks.deadLetter,
      skipped: transitions.skipped + webhooks.skipped,
      errors: transitions.errors + webhooks.errors,
    };
  },
  // This only centralizes invocation and locking; reconciliation behavior is unchanged.
  "subscription-reconciliation": () => runSubscriptionReconciliation(),
  "provider-sync": async (input) => {
    const limit = typeof input?.limit === "number" ? input.limit : 1;
    return runProviderSyncBatch(limit);
  },
};

type SafeJobSummary = Record<string, number>;

const summaryKeys: Record<JobId, readonly string[]> = {
  "database-backup": [],
  "cleanup-orders": ["expired"],
  "media-cleanup": ["orphaned", "deleted", "errors"],
  "webhook-outbox": [
    "scanned",
    "claimed",
    "processed",
    "sent",
    "delivered",
    "failed",
    "deadLetter",
    "skipped",
    "errors",
  ],
  "subscription-reconciliation": [
    "scanned",
    "updated",
    "revoked",
    "errors",
    "staleCleanedUp",
    "orphansRepaired",
  ],
  "provider-sync": ["claimed", "succeeded", "partiallyFailed", "failed", "requeued", "leaseLost"],
};

export function summarizeJobResult(jobId: JobId, result: unknown): SafeJobSummary {
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};

  const source = result as Record<string, unknown>;
  const summary: SafeJobSummary = {};
  for (const key of summaryKeys[jobId]) {
    const value = source[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      summary[key] = value;
    }
  }
  return summary;
}
