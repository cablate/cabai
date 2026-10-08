import { eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-route";
import { writeRequiredAuditLogInTransaction } from "@/lib/audit";
import { withCronLock } from "@/lib/cron-lock";
import { db } from "@/lib/db";
import {
  orders,
  entitlementOutbox,
  operationSnapshots,
  plans,
  portalyMarketplaceEvents,
  providerSyncChangeSets,
  providerSyncJobs,
  userPurchases,
} from "@/lib/db/schema";
import { hashProviderSyncIdempotencyKey, providerSyncStateFingerprint, toProviderSyncJobResponse } from "@/lib/provider-sync-ledger";

type SnapshotRow = Record<string, unknown>;
type StoredChange = { entityType?: string; entityId?: string; action?: string; after?: Record<string, unknown> | null };

function snapshotRows(value: unknown): SnapshotRow[] {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new ApiError({ code: "SNAPSHOT_INVALID", message: "Operation snapshot is malformed; recovery was refused", status: 409 });
  }
  return value as SnapshotRow[];
}

function idFrom(row: SnapshotRow): string | null {
  return typeof row.id === "string" ? row.id : null;
}

async function upsertSnapshotRow(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], table: "orders" | "plans" | "user_purchases", row: SnapshotRow) {
  const columns = Object.keys(row);
  if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) {
    throw new ApiError({ code: "SNAPSHOT_INVALID", message: "Operation snapshot contains invalid columns", status: 409 });
  }
  const quoted = columns.map((column) => `"${column}"`).join(", ");
  const updates = columns.filter((column) => column !== "id")
    .map((column) => `"${column}" = EXCLUDED."${column}"`).join(", ");
  const tableIdentifier = sql.raw(`"${table}"`);
  const columnsIdentifier = sql.raw(quoted);
  await tx.execute(sql`
    INSERT INTO ${tableIdentifier} (${columnsIdentifier})
    SELECT ${columnsIdentifier}
    FROM jsonb_populate_record(NULL::${tableIdentifier}, ${JSON.stringify(row)}::jsonb)
    ON CONFLICT ("id") DO UPDATE SET ${sql.raw(updates)}
  `);
}

async function hasPlanReferences(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], planId: string): Promise<boolean> {
  const result = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM orders WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM user_purchases WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM plan_contents WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM service_configs WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM plan_courses WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM plan_presentations WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM portaly_product_mappings WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM portaly_marketplace_events WHERE matched_plan_id = ${planId}
      UNION ALL SELECT 1 FROM discord_role_mappings WHERE plan_id = ${planId}
      UNION ALL SELECT 1 FROM entitlement_outbox WHERE plan_id = ${planId}
    ) AS referenced
  `);
  return Boolean((result.rows[0] as { referenced?: boolean } | undefined)?.referenced);
}

async function restorePlanSnapshot(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], rows: SnapshotRow[], changes: StoredChange[]) {
  const beforeById = new Map(rows.map((row) => [idFrom(row), row]).filter((entry): entry is [string, SnapshotRow] => Boolean(entry[0])));
  for (const change of changes.filter((item) => item.entityType === "plan")) {
    if (!change.entityId) continue;
    const before = beforeById.get(change.entityId);
    if (before) {
      await upsertSnapshotRow(tx, "plans", before);
    } else if (change.action === "create") {
      if (await hasPlanReferences(tx, change.entityId)) {
        throw new ApiError({ code: "RECOVERY_REFERENCED_PLAN", message: `New plan ${change.entityId} is now referenced; remove references before recovery`, status: 409 });
      }
      await tx.delete(plans).where(eq(plans.id, change.entityId));
    } else if (change.action === "update") {
      throw new ApiError({ code: "SNAPSHOT_INVALID", message: `Pre-sync plan ${change.entityId} is missing from the snapshot`, status: 409 });
    }
  }
}

function affectedOrderIds(operation: "orders" | "subscriptions", changes: StoredChange[]): string[] {
  const ids = new Set<string>();
  for (const change of changes) {
    if (operation === "orders" && change.entityType === "order" && typeof change.after?.id === "string") ids.add(change.after.id);
    if (operation === "subscriptions" && change.entityType === "order" && change.entityId) ids.add(change.entityId);
    if ((change.entityType === "subscription" || change.entityType === "entitlement") && change.entityId) ids.add(change.entityId);
  }
  return [...ids];
}

async function restoreOrderSnapshot(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  snapshot: Record<string, unknown[]>,
  operation: "orders" | "subscriptions",
  jobId: string,
  changes: StoredChange[],
) {
  const orderRows = snapshotRows(snapshot.orders);
  const purchaseRows = snapshotRows(snapshot.user_purchases);
  const orderIds = affectedOrderIds(operation, changes);
  const originalOrderIds = new Set(orderRows.map(idFrom).filter((id): id is string => Boolean(id)));
  const newOrderIds = orderIds.filter((id) => !originalOrderIds.has(id));

  const generatedTransitions = await tx.execute(sql`
    SELECT status, webhook_enqueued_at, discord_synced_at FROM entitlement_outbox
    WHERE triggered_by = ${`provider-sync:${jobId}`}
  `);
  if (generatedTransitions.rows.some((row) => {
    const event = row as { status?: string; webhook_enqueued_at?: unknown; discord_synced_at?: unknown };
    return event.status !== "pending" || event.webhook_enqueued_at != null || event.discord_synced_at != null;
  })) {
    throw new ApiError({ code: "RECOVERY_SIDE_EFFECT_ALREADY_SENT", message: "Provider sync transitions have started external delivery; automatic recovery is unsafe", status: 409 });
  }

  if (newOrderIds.length > 0) {
    const references = await tx.select({ id: portalyMarketplaceEvents.id })
      .from(portalyMarketplaceEvents)
      .where(inArray(portalyMarketplaceEvents.createdOrderId, newOrderIds));
    if (references.length > 0) {
      throw new ApiError({ code: "RECOVERY_REFERENCED_ORDER", message: "A new order is referenced by a Portaly marketplace event; automatic recovery is unsafe", status: 409 });
    }
  }

  await tx.delete(entitlementOutbox).where(eq(entitlementOutbox.triggeredBy, `provider-sync:${jobId}`));

  if (orderIds.length > 0) {
    const oldPurchases = new Set(purchaseRows.map(idFrom).filter((id): id is string => Boolean(id)));
    const currentPurchases = await tx.select({ id: userPurchases.id })
      .from(userPurchases)
      .where(inArray(userPurchases.orderId, orderIds));
    const orphanedPurchaseIds = currentPurchases.map((row) => row.id).filter((id) => !oldPurchases.has(id));
    if (orphanedPurchaseIds.length > 0) await tx.delete(userPurchases).where(inArray(userPurchases.id, orphanedPurchaseIds));
    for (const row of purchaseRows) {
      if (typeof row.order_id === "string" && orderIds.includes(row.order_id)) await upsertSnapshotRow(tx, "user_purchases", row);
    }

    if (newOrderIds.length > 0) await tx.delete(orders).where(inArray(orders.id, newOrderIds));
    const orderRowsById = new Map(orderRows.map((row) => [idFrom(row), row]));
    for (const id of orderIds) {
      const before = orderRowsById.get(id);
      if (before) await upsertSnapshotRow(tx, "orders", before);
    }
  }
}

export async function recoverProviderSyncJob(input: {
  jobId: string;
  actorId: string;
  agentName: string;
  idempotencyKey: string;
}) {
  const keyHash = hashProviderSyncIdempotencyKey(input.idempotencyKey);
  const locked = await withCronLock(`provider-sync-recover:${input.jobId}:${input.actorId}:${keyHash}`, async () => {
    const job = await db.query.providerSyncJobs.findFirst({
      where: eq(providerSyncJobs.id, input.jobId),
    });
    if (!job || job.actorId !== input.actorId) throw new ApiError({ code: "NOT_FOUND", message: "Provider sync job not found", status: 404 });
    if (job.status === "recovered") {
      if (job.recoveryKeyHash !== keyHash) throw new ApiError({ code: "IDEMPOTENCY_CONFLICT", message: "Job was already recovered with another Idempotency-Key", status: 409 });
      return { job: toProviderSyncJobResponse(job), replayed: true };
    }
    if (!["succeeded", "partially_failed"].includes(job.status)) {
      throw new ApiError({ code: "RECOVERY_INVALID_STATE", message: "Only completed sync jobs can be recovered", status: 409 });
    }
    if (!job.snapshotId || !job.result || typeof job.result.postStateFingerprint !== "string") {
      throw new ApiError({ code: "RECOVERY_UNAVAILABLE", message: "This sync job has no complete recovery snapshot", status: 409 });
    }
    const [snapshot, changeSet] = await Promise.all([
      db.query.operationSnapshots.findFirst({ where: eq(operationSnapshots.id, job.snapshotId) }),
      db.query.providerSyncChangeSets.findFirst({ where: eq(providerSyncChangeSets.id, job.changeSetId) }),
    ]);
    if (!snapshot || !changeSet || changeSet.actorId !== input.actorId || changeSet.operation !== job.operation) {
      throw new ApiError({ code: "RECOVERY_UNAVAILABLE", message: "Sync snapshot or change set is unavailable", status: 409 });
    }
    const changes = changeSet.changes as StoredChange[];
    const tablesData = snapshot.tablesData as Record<string, unknown[]>;
    const restored = changes.length;

    await db.transaction(async (tx) => {
      const lockedTables = job.operation === "plans"
        ? '"plans"'
        : '"orders", "user_purchases", "entitlement_outbox"';
      await tx.execute(sql.raw(`LOCK TABLE ${lockedTables} IN SHARE ROW EXCLUSIVE MODE`));
      const actualFingerprint = await providerSyncStateFingerprint(job.operation);
      if (actualFingerprint !== job.result!.postStateFingerprint) {
        throw new ApiError({ code: "RECOVERY_STATE_CHANGED", message: "Local sync state changed since execution; automatic recovery was refused", status: 409 });
      }
      if (job.operation === "plans") {
        await restorePlanSnapshot(tx, snapshotRows(tablesData.plans), changes);
      } else {
        await restoreOrderSnapshot(tx, tablesData, job.operation, job.id, changes);
      }
      const nextResult = { ...job.result, recoveredAt: new Date().toISOString() };
      const auditId = await writeRequiredAuditLogInTransaction(tx, {
        actorType: "agent",
        actorId: input.actorId,
        action: "recover_provider_sync",
        entityType: "provider_sync_job",
        entityId: job.id,
        metadata: { agentName: input.agentName, operation: job.operation, restored },
      });
      await tx.update(providerSyncJobs).set({
        status: "recovered",
        recoveryKeyHash: keyHash,
        result: nextResult,
        auditId,
        finishedAt: new Date(),
      }).where(eq(providerSyncJobs.id, job.id));
    });

    const recovered = await db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, job.id) });
    if (!recovered) throw new Error("Recovered provider-sync job could not be read back");
    return { job: toProviderSyncJobResponse(recovered), replayed: false, restored };
  });
  if (!locked.locked) throw new ApiError({ code: "SYNC_RECOVERY_BUSY", message: "Another request is recovering this sync job", status: 409 });
  return locked.result;
}
