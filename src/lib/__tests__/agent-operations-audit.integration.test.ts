import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, entitlementOutbox, userPurchases, webhookLogs } from "@/lib/db/schema";
import {
  grantStandaloneEntitlement,
  revokePurchaseEntitlement,
} from "@/lib/entitlement-transitions";
import {
  createAgentGrant,
  retryAgentWebhook,
  revokeAgentGrant,
} from "@/lib/services/agent-operations-service";
import {
  cleanTestData,
  createTestPlan,
  createTestServiceConfig,
  createTestUser,
} from "@/test/helpers";

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

describe("durable agent operation audit evidence", () => {
  it("commits grant/revoke/retry with read-back audit IDs, including an exact grant replay", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan();
    const actor = { agentId: "agent-audit-test", name: "Audit test agent" };

    const created = await createAgentGrant({
      userId: user.id,
      planId: plan.id,
      idempotencyKey: "grant-audit-test",
      actor,
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") throw new Error("Expected grant creation");
    const grantAuditId = created.data.auditId;
    expect(grantAuditId).toBeTruthy();
    await expect(db.query.auditLogs.findFirst({ where: eq(auditLogs.id, grantAuditId) }))
      .resolves.toMatchObject({ action: "grant_access", entityId: created.data.id });

    const grantReplay = await createAgentGrant({
      userId: user.id,
      planId: plan.id,
      idempotencyKey: "grant-audit-test",
      actor,
    });
    expect(grantReplay.kind).toBe("replayed");
    if (grantReplay.kind !== "replayed") throw new Error("Expected grant replay");
    expect(grantReplay.data.auditId).toBe(grantAuditId);

    const revoked = await revokeAgentGrant({ purchaseId: created.data.id, actor });
    expect(revoked?.auditId).toBeTruthy();
    await expect(db.query.auditLogs.findFirst({ where: eq(auditLogs.id, revoked!.auditId!) }))
      .resolves.toMatchObject({ action: "revoke_access", entityId: created.data.id });

    const serviceConfig = await createTestServiceConfig(plan.id);
    const [webhook] = await db.insert(webhookLogs).values({
      serviceConfigId: serviceConfig.id,
      eventType: "entitlement.granted",
      payloadJson: "{}",
      idempotencyKey: "agent-retry-audit-test",
      status: "dead_letter",
    }).returning({ id: webhookLogs.id });
    const retryAttempts = await Promise.all([
      retryAgentWebhook(webhook!.id, actor, "retry-audit-readback"),
      retryAgentWebhook(webhook!.id, actor, "retry-audit-readback"),
    ]);
    const retried = retryAttempts.find((result) => result?.kind === "result" && !result.replayed);
    const replay = retryAttempts.find((result) => result?.kind === "result" && result.replayed);
    expect(retried?.kind).toBe("result");
    if (retried?.kind !== "result") throw new Error("Expected webhook retry");
    expect(retried.replayed).toBe(false);
    expect(replay).toMatchObject({ kind: "result", replayed: true, data: { auditId: retried.data.auditId } });
    expect(retried.data.auditId).toBeTruthy();
    await expect(db.query.auditLogs.findFirst({ where: eq(auditLogs.id, retried.data.auditId) }))
      .resolves.toMatchObject({ action: "webhook_retry", entityId: webhook!.id });

    const [otherWebhook] = await db.insert(webhookLogs).values({
      serviceConfigId: serviceConfig.id,
      eventType: "entitlement.revoked",
      payloadJson: "{}",
      idempotencyKey: "agent-retry-different-payload",
      status: "failed",
    }).returning({ id: webhookLogs.id });
    await expect(retryAgentWebhook(otherWebhook!.id, actor, "retry-audit-readback"))
      .resolves.toEqual({ kind: "conflict" });
    await expect(db.query.webhookLogs.findFirst({ where: eq(webhookLogs.id, otherWebhook!.id) }))
      .resolves.toMatchObject({ status: "failed" });
  });

  it("rolls back a new grant and its outbox transition when the required audit insert fails", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan();

    await expect(grantStandaloneEntitlement({
      purchaseId: "purchase-audit-failure",
      userId: user.id,
      planId: plan.id,
      grantedBy: "manual",
      triggeredBy: "test.audit-failure",
      duplicatePolicy: "any-active",
      requiredAudit: {
        actorType: "agent",
        actorId: null as unknown as string,
        action: "grant_access",
        entityType: "userPurchase",
        entityId: "purchase-audit-failure",
      },
    })).rejects.toThrow();

    await expect(db.query.userPurchases.findFirst({ where: eq(userPurchases.id, "purchase-audit-failure") }))
      .resolves.toBeUndefined();
    await expect(db.query.entitlementOutbox.findMany({ where: eq(entitlementOutbox.purchaseId, "purchase-audit-failure") }))
      .resolves.toHaveLength(0);
  });

  it("rolls back a revoke and its outbox transition when required audit evidence fails", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan();
    const grant = await grantStandaloneEntitlement({
      userId: user.id,
      planId: plan.id,
      grantedBy: "manual",
      triggeredBy: "test.seed",
      duplicatePolicy: "any-active",
    });

    await expect(revokePurchaseEntitlement({
      purchaseId: grant.id,
      revokedBy: "agent:test",
      triggeredBy: "agent:test",
      requiredAudit: (purchase) => ({
        actorType: "agent",
        actorId: null as unknown as string,
        action: "revoke_access",
        entityType: "userPurchase",
        entityId: purchase.id,
      }),
    })).rejects.toThrow();

    await expect(db.query.userPurchases.findFirst({ where: eq(userPurchases.id, grant.id) }))
      .resolves.toMatchObject({ revokedAt: null });
    await expect(db.query.entitlementOutbox.findMany({
      where: and(
        eq(entitlementOutbox.purchaseId, grant.id),
        eq(entitlementOutbox.eventType, "entitlement.revoked"),
      ),
    })).resolves.toHaveLength(0);
  });

  it("rolls back webhook retry state when its required audit insert fails", async () => {
    const plan = await createTestPlan();
    const serviceConfig = await createTestServiceConfig(plan.id);
    const [webhook] = await db.insert(webhookLogs).values({
      serviceConfigId: serviceConfig.id,
      eventType: "entitlement.granted",
      payloadJson: "{}",
      idempotencyKey: "agent-retry-audit-failure",
      status: "failed",
    }).returning({ id: webhookLogs.id });

    await expect(retryAgentWebhook(webhook!.id, { agentId: null as unknown as string }, "retry-audit-failure"))
      .rejects.toThrow();

    await expect(db.query.webhookLogs.findFirst({ where: eq(webhookLogs.id, webhook!.id) }))
      .resolves.toMatchObject({ status: "failed" });
    await expect(db.query.auditLogs.findMany({ where: eq(auditLogs.entityId, webhook!.id) }))
      .resolves.toHaveLength(0);
  });

  it("does not report an already revoked grant as a successful revoke", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan();
    const actor = { agentId: "agent-audit-test", name: "Audit test agent" };
    const created = await createAgentGrant({
      userId: user.id,
      planId: plan.id,
      idempotencyKey: "grant-revoke-once",
      actor,
    });
    if (created.kind !== "created") throw new Error("Expected grant creation");

    expect(await revokeAgentGrant({ purchaseId: created.data.id, actor })).toBeTruthy();
    expect(await revokeAgentGrant({ purchaseId: created.data.id, actor })).toBeNull();
    await expect(db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.action, "revoke_access"),
        eq(auditLogs.entityId, created.data.id),
      ),
    })).resolves.toHaveLength(1);
  });
});
