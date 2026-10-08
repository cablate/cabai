import { randomUUID } from "node:crypto";
import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as AuditModule from "@/lib/audit";

const recoveryAuditControls = vi.hoisted(() => ({ fail: false }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof AuditModule>();
  return {
    ...actual,
    writeRequiredAuditLogInTransaction: async (
      tx: Parameters<typeof actual.writeRequiredAuditLogInTransaction>[0],
      params: Parameters<typeof actual.writeRequiredAuditLogInTransaction>[1],
    ) => {
      if (recoveryAuditControls.fail && params.action === "recover_provider_sync") {
        throw new Error("Injected recovery audit failure");
      }
      return actual.writeRequiredAuditLogInTransaction(tx, params);
    },
  };
});
import { db } from "@/lib/db";
import {
  entitlementOutbox,
  operationSnapshots,
  orders,
  plans,
  providerSyncChangeSets,
  providerSyncJobs,
  userPurchases,
  users,
} from "@/lib/db/schema";
import {
  claimProviderSyncJob,
  heartbeatProviderSyncJob,
  hashProviderSyncIdempotencyKey,
  providerSyncStateFingerprint,
} from "@/lib/provider-sync-ledger";
import { recoverProviderSyncJob } from "@/lib/provider-sync-recovery";
import { createTestOrder, createTestPlan, createTestUser } from "@/test/helpers";

type PlanFixture = {
  planId: string;
  snapshotId: string;
  changeSetId: string;
  jobId: string;
  actorId: string;
  recoveryKey: string;
};

type OrderFixture = PlanFixture & {
  userId: string;
  orderId: string;
  purchaseId: string;
};

async function cleanupOrphanedRecoveryFixtures(): Promise<void> {
  const result = await db.execute(sql`
    SELECT id, tables_data
    FROM operation_snapshots
    WHERE metadata->>'source' = 'provider-sync-recovery.integration.test'
  `);
  const snapshots = result.rows as unknown as Array<{
    id: string;
    tables_data: Record<string, Array<Record<string, unknown>>>;
  }>;
  const snapshotIds = snapshots.map((snapshot) => snapshot.id);
  const planIds = new Set<string>();
  const orderIds = new Set<string>();
  const userIds = new Set<string>();

  for (const snapshot of snapshots) {
    for (const plan of snapshot.tables_data.plans ?? []) {
      if (typeof plan.id === "string") planIds.add(plan.id);
    }
    for (const order of snapshot.tables_data.orders ?? []) {
      if (typeof order.id === "string") orderIds.add(order.id);
      if (typeof order.plan_id === "string") planIds.add(order.plan_id);
      if (typeof order.user_id === "string") userIds.add(order.user_id);
    }
  }

  await db.delete(providerSyncJobs).where(like(providerSyncJobs.actorId, "recovery-test-%"));
  await db.delete(providerSyncChangeSets).where(like(providerSyncChangeSets.actorId, "recovery-test-%"));
  if (orderIds.size > 0) {
    const ids = [...orderIds];
    await db.delete(entitlementOutbox).where(inArray(entitlementOutbox.orderId, ids));
    await db.delete(userPurchases).where(inArray(userPurchases.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  if (planIds.size > 0) await db.delete(plans).where(inArray(plans.id, [...planIds]));
  if (userIds.size > 0) await db.delete(users).where(inArray(users.id, [...userIds]));
  if (snapshotIds.length > 0) await db.delete(operationSnapshots).where(inArray(operationSnapshots.id, snapshotIds));
}

async function readRow(table: "plans" | "orders", id: string): Promise<Record<string, unknown>> {
  const result = table === "plans"
    ? await db.execute(sql`SELECT row_to_json(p) AS data FROM plans p WHERE id = ${id}`)
    : await db.execute(sql`SELECT row_to_json(o) AS data FROM orders o WHERE id = ${id}`);
  const row = result.rows[0] as { data?: Record<string, unknown> } | undefined;
  if (!row?.data) throw new Error(`Expected ${table} fixture row`);
  return row.data;
}

async function insertChangeSetAndJob(input: {
  operation: "plans" | "orders";
  snapshotId: string;
  actorId: string;
  jobId: string;
  change: Record<string, unknown>;
  postStateFingerprint: string;
}): Promise<{ changeSetId: string }> {
  const changeSetId = randomUUID();
  const now = new Date();
  await db.insert(providerSyncChangeSets).values({
    id: changeSetId,
    operation: input.operation,
    actorId: input.actorId,
    sourceFingerprint: `source-${randomUUID()}`,
    fingerprint: `change-${randomUUID()}`,
    changes: [input.change],
    counts: { update: 1 },
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await db.insert(providerSyncJobs).values({
    id: input.jobId,
    operation: input.operation,
    actorId: input.actorId,
    idempotencyKeyHash: hashProviderSyncIdempotencyKey(`execute-${randomUUID()}`),
    changeSetId,
    requestFingerprint: `request-${randomUUID()}`,
    snapshotId: input.snapshotId,
    status: "succeeded",
    synced: 1,
    result: { synced: 1, postStateFingerprint: input.postStateFingerprint },
    startedAt: new Date(now.getTime() - 1_000),
    finishedAt: now,
  });
  return { changeSetId };
}

async function createPlanFixture(): Promise<PlanFixture> {
  const plan = await createTestPlan({ name: "Before provider sync" });
  const before = await readRow("plans", plan.id);
  await db.update(plans).set({ name: "After provider sync", status: "inactive" }).where(eq(plans.id, plan.id));

  const snapshotId = randomUUID();
  await db.insert(operationSnapshots).values({
    id: snapshotId,
    operation: "sync-plans",
    tablesData: { plans: [before] },
    metadata: { source: "provider-sync-recovery.integration.test" },
  });

  const jobId = randomUUID();
  const actorId = `recovery-test-${randomUUID()}`;
  const { changeSetId } = await insertChangeSetAndJob({
    operation: "plans",
    snapshotId,
    actorId,
    jobId,
    change: {
      entityType: "plan",
      entityId: plan.id,
      action: "update",
      after: { id: plan.id, name: "After provider sync", status: "inactive" },
    },
    postStateFingerprint: await providerSyncStateFingerprint("plans"),
  });

  return { planId: plan.id, snapshotId, changeSetId, jobId, actorId, recoveryKey: `recover-${randomUUID()}` };
}

async function createOrderFixture(delivered: boolean): Promise<OrderFixture> {
  const user = await createTestUser();
  const plan = await createTestPlan();
  const order = await createTestOrder(user.id, plan.id);
  const beforeOrder = await readRow("orders", order.id);
  const jobId = randomUUID();
  const actorId = `recovery-test-${randomUUID()}`;
  const recoveryKey = `recover-${randomUUID()}`;

  await db.update(orders).set({ status: "completed", paidAmount: 9900 }).where(eq(orders.id, order.id));
  const [purchase] = await db.insert(userPurchases).values({
    userId: user.id,
    planId: plan.id,
    orderId: order.id,
    grantedBy: "payment",
  }).returning({ id: userPurchases.id });
  if (!purchase) throw new Error("Expected provider-sync purchase fixture");

  const transitionId = randomUUID();
  await db.insert(entitlementOutbox).values({
    eventType: "entitlement.granted",
    userId: user.id,
    planId: plan.id,
    orderId: order.id,
    purchaseId: purchase.id,
    source: "payment",
    triggeredBy: `provider-sync:${jobId}`,
    idempotencyKey: `provider-sync-recovery-${transitionId}`,
    status: delivered ? "delivered" : "pending",
    webhookEnqueuedAt: delivered ? new Date() : null,
  });

  const snapshotId = randomUUID();
  await db.insert(operationSnapshots).values({
    id: snapshotId,
    operation: "rebuild-orders",
    tablesData: { orders: [beforeOrder], user_purchases: [] },
    metadata: { source: "provider-sync-recovery.integration.test" },
  });
  const { changeSetId } = await insertChangeSetAndJob({
    operation: "orders",
    snapshotId,
    actorId,
    jobId,
    change: {
      entityType: "order",
      entityId: order.id,
      action: "update",
      after: { id: order.id, status: "completed" },
    },
    postStateFingerprint: await providerSyncStateFingerprint("orders"),
  });

  return {
    planId: plan.id,
    userId: user.id,
    orderId: order.id,
    purchaseId: purchase.id,
    snapshotId,
    changeSetId,
    jobId,
    actorId,
    recoveryKey,
  };
}

async function cleanupFixture(fixture: PlanFixture | OrderFixture): Promise<void> {
  await db.delete(providerSyncJobs).where(eq(providerSyncJobs.id, fixture.jobId));
  await db.delete(providerSyncChangeSets).where(eq(providerSyncChangeSets.id, fixture.changeSetId));
  await db.delete(operationSnapshots).where(eq(operationSnapshots.id, fixture.snapshotId));

  if ("orderId" in fixture) {
    await db.delete(entitlementOutbox).where(eq(entitlementOutbox.triggeredBy, `provider-sync:${fixture.jobId}`));
    await db.delete(userPurchases).where(eq(userPurchases.orderId, fixture.orderId));
    await db.delete(orders).where(eq(orders.id, fixture.orderId));
    await db.delete(plans).where(eq(plans.id, fixture.planId));
    await db.delete(users).where(eq(users.id, fixture.userId));
    return;
  }

  await db.delete(plans).where(eq(plans.id, fixture.planId));
}

beforeAll(cleanupOrphanedRecoveryFixtures);
afterAll(cleanupOrphanedRecoveryFixtures);

describe("provider sync recovery with PostgreSQL state", () => {
  it("does not reclaim a live heartbeat lease and reclaims it after expiry", async () => {
    const fixture = await createPlanFixture();
    try {
      const old = new Date(Date.now() - 60 * 60_000);
      await db.update(providerSyncJobs).set({
        status: "queued",
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        nextAttemptAt: old,
        startedAt: old,
        finishedAt: null,
      }).where(eq(providerSyncJobs.id, fixture.jobId));

      const first = await claimProviderSyncJob();
      expect(first?.job.id).toBe(fixture.jobId);
      expect(await heartbeatProviderSyncJob(fixture.jobId, first!.leaseOwner)).toBe(true);
      expect(await claimProviderSyncJob()).toBeNull();

      await db.update(providerSyncJobs).set({
        leaseExpiresAt: new Date(Date.now() - 1),
      }).where(eq(providerSyncJobs.id, fixture.jobId));
      const reclaimed = await claimProviderSyncJob();

      expect(reclaimed?.job.id).toBe(fixture.jobId);
      expect(reclaimed?.leaseOwner).not.toBe(first!.leaseOwner);
      expect(reclaimed?.job.attemptCount).toBe(2);
      expect(await heartbeatProviderSyncJob(fixture.jobId, first!.leaseOwner)).toBe(false);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("restores the order snapshot and replays the same recovery key without another mutation", async () => {
    const fixture = await createOrderFixture(false);
    try {
      const first = await recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: fixture.recoveryKey,
      });

      expect(first).toMatchObject({ replayed: false, restored: 1, job: { status: "recovered" } });
      await expect(db.query.orders.findFirst({ where: eq(orders.id, fixture.orderId) }))
        .resolves.toMatchObject({ status: "pending", paidAmount: null });
      await expect(db.query.userPurchases.findMany({ where: eq(userPurchases.orderId, fixture.orderId) }))
        .resolves.toHaveLength(0);
      await expect(db.query.entitlementOutbox.findMany({ where: eq(entitlementOutbox.triggeredBy, `provider-sync:${fixture.jobId}`) }))
        .resolves.toHaveLength(0);

      const replay = await recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: fixture.recoveryKey,
      });
      expect(replay).toMatchObject({ replayed: true, job: { status: "recovered" } });
      await expect(recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: `${fixture.recoveryKey}-different`,
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("refuses recovery when provider-owned local state changed after the sync", async () => {
    const fixture = await createPlanFixture();
    try {
      await db.update(plans).set({ name: "Changed after sync" }).where(eq(plans.id, fixture.planId));

      await expect(recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: fixture.recoveryKey,
      })).rejects.toMatchObject({ code: "RECOVERY_STATE_CHANGED", status: 409 });
      await expect(db.query.plans.findFirst({ where: eq(plans.id, fixture.planId) }))
        .resolves.toMatchObject({ name: "Changed after sync" });
      await expect(db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, fixture.jobId) }))
        .resolves.toMatchObject({ status: "succeeded", recoveryKeyHash: null });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("rolls back recovered data and job state when required recovery audit fails", async () => {
    const fixture = await createOrderFixture(false);
    try {
      recoveryAuditControls.fail = true;
      await expect(recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: fixture.recoveryKey,
      })).rejects.toThrow("Injected recovery audit failure");

      await expect(db.query.orders.findFirst({ where: eq(orders.id, fixture.orderId) }))
        .resolves.toMatchObject({ status: "completed", paidAmount: 9900 });
      await expect(db.query.userPurchases.findMany({ where: eq(userPurchases.orderId, fixture.orderId) }))
        .resolves.toHaveLength(1);
      await expect(db.query.entitlementOutbox.findMany({ where: eq(entitlementOutbox.triggeredBy, `provider-sync:${fixture.jobId}`) }))
        .resolves.toMatchObject([expect.objectContaining({ status: "pending" })]);
      await expect(db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, fixture.jobId) }))
        .resolves.toMatchObject({ status: "succeeded", recoveryKeyHash: null });
    } finally {
      recoveryAuditControls.fail = false;
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("refuses recovery after a generated entitlement transition was externally delivered", async () => {
    const fixture = await createOrderFixture(true);
    try {
      await expect(recoverProviderSyncJob({
        jobId: fixture.jobId,
        actorId: fixture.actorId,
        agentName: "Recovery test agent",
        idempotencyKey: fixture.recoveryKey,
      })).rejects.toMatchObject({ code: "RECOVERY_SIDE_EFFECT_ALREADY_SENT", status: 409 });
      await expect(db.query.orders.findFirst({ where: eq(orders.id, fixture.orderId) }))
        .resolves.toMatchObject({ status: "completed", paidAmount: 9900 });
      await expect(db.query.userPurchases.findMany({ where: eq(userPurchases.orderId, fixture.orderId) }))
        .resolves.toHaveLength(1);
      await expect(db.query.entitlementOutbox.findMany({ where: eq(entitlementOutbox.triggeredBy, `provider-sync:${fixture.jobId}`) }))
        .resolves.toMatchObject([expect.objectContaining({ status: "delivered" })]);
      await expect(db.query.providerSyncJobs.findFirst({ where: eq(providerSyncJobs.id, fixture.jobId) }))
        .resolves.toMatchObject({ status: "succeeded", recoveryKeyHash: null });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);
});
