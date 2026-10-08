import { and, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  auditLogs,
  entitlementOutbox,
  plans,
  serviceConfigs,
  userPurchases,
  users,
  webhookLogs,
} from "@/lib/db/schema";
import {
  createAgentGrant,
  retryAgentWebhook,
} from "@/lib/services/agent-operations-service";
import {
  createTestPlan,
  createTestServiceConfig,
  createTestUser,
} from "@/test/helpers";

const userIds: string[] = [];
const planIds: string[] = [];
const serviceConfigIds: string[] = [];
const purchaseIds: string[] = [];
const webhookIds: string[] = [];

afterEach(async () => {
  const evidenceIds = [...purchaseIds, ...webhookIds];
  if (evidenceIds.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, evidenceIds));
  }
  if (purchaseIds.length > 0) {
    await db.delete(entitlementOutbox).where(inArray(entitlementOutbox.purchaseId, purchaseIds));
    await db.delete(userPurchases).where(inArray(userPurchases.id, purchaseIds));
  }
  if (webhookIds.length > 0) await db.delete(webhookLogs).where(inArray(webhookLogs.id, webhookIds));
  if (serviceConfigIds.length > 0) await db.delete(serviceConfigs).where(inArray(serviceConfigs.id, serviceConfigIds));
  if (planIds.length > 0) await db.delete(plans).where(inArray(plans.id, planIds));
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  userIds.length = 0;
  planIds.length = 0;
  serviceConfigIds.length = 0;
  purchaseIds.length = 0;
  webhookIds.length = 0;
});

describe("high-risk Agent mutation negative paths", () => {
  it("does not create a second grant or audit on key reuse with changed expiry or an already-active grant", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const plan = await createTestPlan();
    planIds.push(plan.id);
    const actor = { agentId: `negative-test-${crypto.randomUUID()}` };

    const parallelResults = await Promise.all([
      createAgentGrant({
        userId: user.id,
        planId: plan.id,
        idempotencyKey: "negative-grant-replay",
        actor,
      }),
      createAgentGrant({
        userId: user.id,
        planId: plan.id,
        idempotencyKey: "negative-grant-replay",
        actor,
      }),
    ]);
    const created = parallelResults.find((result) => result.kind === "created");
    const replayed = parallelResults.find((result) => result.kind === "replayed");
    expect(created).toBeDefined();
    expect(replayed).toBeDefined();
    if (!created || !replayed) throw new Error("Expected one grant and one concurrent replay");
    expect(replayed.data.auditId).toBe(created.data.auditId);
    purchaseIds.push(created.data.id);

    const changedPayload = await createAgentGrant({
      userId: user.id,
      planId: plan.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      idempotencyKey: "negative-grant-replay",
      actor,
    });
    const secondKeyForSameActiveGrant = await createAgentGrant({
      userId: user.id,
      planId: plan.id,
      idempotencyKey: "negative-grant-second-key",
      actor,
    });

    expect(changedPayload).toMatchObject({ kind: "duplicate", purchaseId: created.data.id });
    expect(secondKeyForSameActiveGrant).toMatchObject({ kind: "duplicate", purchaseId: created.data.id });
    await expect(db.query.userPurchases.findMany({
      where: and(eq(userPurchases.userId, user.id), eq(userPurchases.planId, plan.id)),
    })).resolves.toHaveLength(1);
    await expect(db.query.entitlementOutbox.findMany({
      where: and(eq(entitlementOutbox.userId, user.id), eq(entitlementOutbox.planId, plan.id)),
    })).resolves.toHaveLength(1);
    await expect(db.query.auditLogs.findMany({
      where: and(eq(auditLogs.actorId, actor.agentId), eq(auditLogs.action, "grant_access")),
    })).resolves.toHaveLength(1);
  }, 30_000);

  it("refuses to retry a pending webhook without changing its retry state or writing an audit", async () => {
    const plan = await createTestPlan();
    planIds.push(plan.id);
    const serviceConfig = await createTestServiceConfig(plan.id);
    serviceConfigIds.push(serviceConfig.id);
    const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
    const [webhook] = await db.insert(webhookLogs).values({
      serviceConfigId: serviceConfig.id,
      eventType: "entitlement.granted",
      payloadJson: "{}",
      idempotencyKey: `negative-pending-${crypto.randomUUID()}`,
      status: "pending",
      attempts: 2,
      nextRetryAt,
      lastError: "still waiting for scheduled delivery",
      lockedBy: "worker-negative-test",
    }).returning({ id: webhookLogs.id });
    if (!webhook) throw new Error("Expected webhook fixture creation");
    webhookIds.push(webhook.id);

    await expect(retryAgentWebhook(
      webhook.id,
      { agentId: `negative-test-${crypto.randomUUID()}` },
      `pending-retry-${crypto.randomUUID()}`,
    )).resolves.toBeNull();
    await expect(db.query.webhookLogs.findFirst({ where: eq(webhookLogs.id, webhook.id) }))
      .resolves.toMatchObject({
        status: "pending",
        attempts: 2,
        nextRetryAt,
        lastError: "still waiting for scheduled delivery",
        lockedBy: "worker-negative-test",
      });
    await expect(db.query.auditLogs.findMany({
      where: eq(auditLogs.entityId, webhook.id),
    })).resolves.toHaveLength(0);
  }, 30_000);
});
