import { and, count, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { writeAuditLog, writeRequiredAuditLogInTransaction } from "@/lib/audit";
import { db } from "@/lib/db";
import { auditLogs, media, orders, planPresentations, plans, serviceConfigs, userDiscordLinks, userPurchases, users, webhookLogs } from "@/lib/db/schema";
import { cleanupOrphanedMedia, previewOrphanedMediaCleanup } from "@/lib/media-cleanup";
import { getStorageProvider } from "@/lib/storage";
import {
  grantStandaloneEntitlement,
  revokePurchaseEntitlement,
} from "@/lib/entitlement-transitions";
import { deriveIdempotentResourceId } from "@/lib/agent/admin-idempotency";

export type AgentActor = { agentId: string; name?: string };

export async function listAgentMembers(input: { planId: string | null; limit: number; actor: AgentActor }) {
  if (input.planId) {
    const rows = await db.select({ userId: userPurchases.userId, email: users.email, name: users.name, role: users.role, grantedAt: userPurchases.grantedAt, grantedBy: userPurchases.grantedBy, expiresAt: userPurchases.expiresAt })
      .from(userPurchases).innerJoin(users, eq(userPurchases.userId, users.id))
      .where(and(eq(userPurchases.planId, input.planId), isNull(userPurchases.revokedAt)))
      .orderBy(desc(userPurchases.grantedAt)).limit(input.limit);
    void writeAuditLog({ actorType: "agent", actorId: input.actor.agentId, action: "members:read", entityType: "member", entityId: input.planId, metadata: { agentName: input.actor.name, planId: input.planId, limit: input.limit, resultCount: rows.length } });
    return rows;
  }
  const members = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt, activePurchases: count(userPurchases.id) })
    .from(users).leftJoin(userPurchases, and(eq(users.id, userPurchases.userId), isNull(userPurchases.revokedAt)))
    .groupBy(users.id).orderBy(desc(users.createdAt)).limit(input.limit);
  const links = await db.select({ userId: userDiscordLinks.userId, discordUsername: userDiscordLinks.discordUsername }).from(userDiscordLinks);
  const map = new Map(links.map((row) => [row.userId, row.discordUsername]));
  const rows = members.map((row) => ({ ...row, discordLinked: map.has(row.id), discordUsername: map.get(row.id) ?? null }));
  void writeAuditLog({ actorType: "agent", actorId: input.actor.agentId, action: "members:read", entityType: "member", entityId: "*", metadata: { agentName: input.actor.name, scope: "all", limit: input.limit, resultCount: rows.length } });
  return rows;
}

export async function listAgentOrders(input: { status: string | null; planId: string | null; limit: number; statsOnly: boolean; actor: AgentActor }) {
  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(orders.status, input.status as typeof orders.status.enumValues[number]));
  if (input.planId) conditions.push(eq(orders.planId, input.planId));
  if (input.statsOnly) {
    const [result] = await db.select({ totalOrders: count(), totalRevenue: sum(orders.paidAmount) }).from(orders).where(conditions.length ? and(...conditions) : undefined);
    void writeAuditLog({ actorType: "agent", actorId: input.actor.agentId, action: "orders:read", entityType: "order", entityId: input.planId ?? "*", metadata: { agentName: input.actor.name, mode: "stats", status: input.status, planId: input.planId, totalOrders: result?.totalOrders ?? 0 } });
    return { totalOrders: result?.totalOrders ?? 0, totalRevenue: Number(result?.totalRevenue ?? 0) };
  }
  const rows = await db.select({ id: orders.id, merchantOrderNumber: orders.merchantOrderNumber, planId: orders.planId, planName: plans.name, planDisplayName: planPresentations.title, userId: orders.userId, userEmail: users.email, userName: users.name, status: orders.status, paidAmount: orders.paidAmount, currency: orders.currency, paymentMethod: orders.paymentMethod, subscriptionStatus: orders.subscriptionStatus, createdAt: orders.createdAt, updatedAt: orders.updatedAt })
    .from(orders).leftJoin(users, eq(orders.userId, users.id)).leftJoin(plans, eq(orders.planId, plans.id)).leftJoin(planPresentations, eq(orders.planId, planPresentations.planId))
    .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(orders.createdAt)).limit(input.limit);
  const data = rows.map((row) => ({ ...row, planDisplayName: row.planDisplayName || row.planName || row.planId }));
  void writeAuditLog({ actorType: "agent", actorId: input.actor.agentId, action: "orders:read", entityType: "order", entityId: input.planId ?? "*", metadata: { agentName: input.actor.name, mode: "list", status: input.status, planId: input.planId, limit: input.limit, resultCount: data.length } });
  return data;
}

export async function createAgentGrant(input: { userId: string; planId: string; expiresAt?: string; idempotencyKey: string; actor: AgentActor }) {
  const [user, plan] = await Promise.all([db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { id: true } }), db.query.plans.findFirst({ where: eq(plans.id, input.planId), columns: { id: true, status: true } })]);
  if (!user) return { kind: "user-not-found" } as const;
  if (!plan) return { kind: "plan-not-found" } as const;
  const purchaseId = deriveIdempotentResourceId({ actorId: input.actor.agentId, operationId: "createGrant", idempotencyKey: input.idempotencyKey });
  const grant = await grantStandaloneEntitlement({
    purchaseId,
    userId: input.userId,
    planId: input.planId,
    grantedBy: "manual",
    triggeredBy: `agent:${input.actor.agentId}`,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    duplicatePolicy: "any-active",
    requiredAudit: { actorType: "agent", actorId: input.actor.agentId, action: "grant_access", entityType: "userPurchase", entityId: purchaseId, metadata: { agentName: input.actor.name, userId: input.userId, planId: input.planId, expiresAt: input.expiresAt ?? null } },
  });
  if (!grant.created) {
    const requestedExpiry = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
    const existingExpiry = grant.expiresAt?.getTime() ?? null;
    if (grant.id !== purchaseId || requestedExpiry !== existingExpiry) return { kind: "duplicate", purchaseId: grant.id } as const;
    if (!grant.auditId) throw new Error("Replayed grant is missing required audit evidence");
    return { kind: "replayed", data: { id: grant.id, userId: input.userId, planId: input.planId, grantedBy: "manual" as const, grantedAt: grant.grantedAt, expiresAt: input.expiresAt ?? null, auditId: grant.auditId } } as const;
  }
  if (!grant.auditId) throw new Error("Created grant is missing required audit evidence");
  const auditId = grant.auditId;
  return { kind: "created", data: { id: grant.id, userId: input.userId, planId: input.planId, grantedBy: "manual" as const, grantedAt: grant.grantedAt, expiresAt: input.expiresAt ?? null, auditId } } as const;
}

export async function revokeAgentGrant(input: { purchaseId: string; actor: AgentActor }) {
  const row = await revokePurchaseEntitlement({
    purchaseId: input.purchaseId,
    revokedBy: `agent:${input.actor.agentId}`,
    triggeredBy: `agent:${input.actor.agentId}`,
    requiredAudit: (purchase) => ({ actorType: "agent", actorId: input.actor.agentId, action: "revoke_access", entityType: "userPurchase", entityId: purchase.id, metadata: { agentName: input.actor.name, userId: purchase.userId, planId: purchase.planId } }),
  });
  if (!row?.changed) return null;
  if (!row.auditId) throw new Error("Revoked grant is missing required audit evidence");
  return row;
}

export async function listAgentGrants(userId: string) {
  return db.select({ id: userPurchases.id, planId: userPurchases.planId, planName: plans.name, orderId: userPurchases.orderId, grantedBy: userPurchases.grantedBy, grantedAt: userPurchases.grantedAt, expiresAt: userPurchases.expiresAt, revokedAt: userPurchases.revokedAt, revokedBy: userPurchases.revokedBy }).from(userPurchases).leftJoin(plans, eq(userPurchases.planId, plans.id)).where(eq(userPurchases.userId, userId)).orderBy(desc(userPurchases.grantedAt));
}

export type MediaListInput = { limit: number; offset: number; status: typeof media.status.enumValues[number] | null; context: typeof media.context.enumValues[number] | null; entityType: string | null; entityId: string | null };
export async function listAgentMedia(input: MediaListInput) {
  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(media.status, input.status));
  if (input.context) conditions.push(eq(media.context, input.context));
  if (input.entityType !== null) conditions.push(eq(media.entityType, input.entityType));
  if (input.entityId !== null) conditions.push(eq(media.entityId, input.entityId));
  return db.select({ id: media.id, storageKey: media.storageKey, publicUrl: media.publicUrl, filename: media.filename, mimeType: media.mimeType, fileSize: media.fileSize, context: media.context, status: media.status, entityType: media.entityType, entityId: media.entityId, uploadedBy: media.uploadedBy, createdAt: media.createdAt, confirmedAt: media.confirmedAt }).from(media).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(media.createdAt)).limit(input.limit).offset(input.offset);
}

export async function deleteAgentMedia(id: string, actor: AgentActor) {
  const record = await db.query.media.findFirst({ where: eq(media.id, id) });
  if (!record) return { kind: "not-found" } as const;
  if (record.status === "confirmed" && record.entityType && record.entityId) return { kind: "bound" } as const;
  let storageDeleteError: unknown;
  try { await getStorageProvider().delete(record.storageKey); } catch (error) { storageDeleteError = error; }
  await db.update(media).set({ status: "deleted" }).where(eq(media.id, id));
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "delete", entityType: "media", entityId: id, metadata: { agentName: actor.name, storageKey: record.storageKey, filename: record.filename, context: record.context, previousStatus: record.status } });
  return { kind: "deleted", storageDeleteError, storageKey: record.storageKey } as const;
}

export async function cleanupAgentMedia(input: { dryRun: boolean; actor: AgentActor }) {
  if (input.dryRun) {
    const preview = await previewOrphanedMediaCleanup();
    return {
      dryRun: true as const,
      wouldOrphan: preview.orphanCandidates.length,
      wouldDelete: preview.deletionCandidates.length,
    };
  }
  const result = await cleanupOrphanedMedia();
  void writeAuditLog({ actorType: "agent", actorId: input.actor.agentId, action: "cleanup", entityType: "media", entityId: "batch", metadata: { agentName: input.actor.name, ...result } });
  return { dryRun: false as const, ...result };
}

export async function listAgentWebhooks(input: { status: typeof webhookLogs.status.enumValues[number] | null; limit: number }) {
  return db.select({ id: webhookLogs.id, serviceConfigId: webhookLogs.serviceConfigId, serviceName: serviceConfigs.serviceName, planId: serviceConfigs.planId, orderId: webhookLogs.orderId, userId: webhookLogs.userId, eventType: webhookLogs.eventType, idempotencyKey: webhookLogs.idempotencyKey, status: webhookLogs.status, httpStatus: webhookLogs.httpStatus, attempts: webhookLogs.attempts, nextRetryAt: webhookLogs.nextRetryAt, lastError: webhookLogs.lastError, createdAt: webhookLogs.createdAt, updatedAt: webhookLogs.updatedAt }).from(webhookLogs).leftJoin(serviceConfigs, eq(webhookLogs.serviceConfigId, serviceConfigs.id)).where(input.status ? eq(webhookLogs.status, input.status) : undefined).orderBy(desc(webhookLogs.createdAt)).limit(input.limit);
}

export type AgentWebhookRetryResult =
  | {
      kind: "result";
      data: { id: string; eventType: string; serviceConfigId: string; idempotencyKey: string; auditId: string };
      replayed: boolean;
    }
  | { kind: "conflict" }
  | null;

export async function retryAgentWebhook(
  logId: string,
  actor: AgentActor,
  idempotencyKey: string,
): Promise<AgentWebhookRetryResult> {
  const idempotencyToken = deriveIdempotentResourceId({
    actorId: actor.agentId,
    operationId: "retryAgentWebhook",
    idempotencyKey,
  });
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ logId })).digest("hex");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-webhook-retry:${actor.agentId}:${idempotencyToken}`}::text, 0))`);

    const [previousOperation] = await tx.select({
      id: auditLogs.id,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
    }).from(auditLogs).where(and(
      eq(auditLogs.actorType, "agent"),
      eq(auditLogs.actorId, actor.agentId),
      eq(auditLogs.action, "webhook_retry"),
      sql`${auditLogs.metadata}->>'idempotencyToken' = ${idempotencyToken}`,
    )).limit(1);

    if (previousOperation) {
      const metadata = previousOperation.metadata && typeof previousOperation.metadata === "object"
        ? previousOperation.metadata as Record<string, unknown>
        : {};
      if (
        metadata.requestFingerprint !== requestFingerprint
        || typeof metadata.eventType !== "string"
        || typeof metadata.serviceConfigId !== "string"
        || typeof metadata.idempotencyKey !== "string"
      ) return { kind: "conflict" };

      return {
        kind: "result",
        replayed: true,
        data: {
          id: previousOperation.entityId,
          eventType: metadata.eventType,
          serviceConfigId: metadata.serviceConfigId,
          idempotencyKey: metadata.idempotencyKey,
          auditId: previousOperation.id,
        },
      };
    }

    const [row] = await tx.update(webhookLogs).set({ status: "pending", attempts: 0, nextRetryAt: null, lockedAt: null, lockedBy: null, lastError: null, updatedAt: new Date() }).where(and(eq(webhookLogs.id, logId), inArray(webhookLogs.status, ["dead_letter", "failed"]))).returning({ id: webhookLogs.id, eventType: webhookLogs.eventType, serviceConfigId: webhookLogs.serviceConfigId, idempotencyKey: webhookLogs.idempotencyKey });
    if (!row) return null;
    const auditId = await writeRequiredAuditLogInTransaction(tx, {
      actorType: "agent",
      actorId: actor.agentId,
      action: "webhook_retry",
      entityType: "webhookLog",
      entityId: logId,
      metadata: {
        agentName: actor.name,
        eventType: row.eventType,
        serviceConfigId: row.serviceConfigId,
        idempotencyKey: row.idempotencyKey,
        idempotencyToken,
        requestFingerprint,
      },
    });
    return { kind: "result", data: { ...row, auditId }, replayed: false };
  });
}
