import { z } from "zod";

export const providerSyncOperationSchema = z.enum(["plans", "orders", "subscriptions"]);

export const providerSyncExecuteSchema = z.object({
  changeSetId: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const providerSyncChangeSchema = z.object({
  entityType: z.enum(["plan", "order", "subscription", "user", "entitlement"]),
  entityId: z.string(),
  action: z.enum(["create", "update", "revoke", "skip", "unchanged"]),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().optional(),
});

export const providerSyncCountsSchema = z.record(z.string(), z.number().int().nonnegative());

export const providerSyncPreviewResponseSchema = z.object({
  changeSetId: z.string().uuid(),
  operation: providerSyncOperationSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  counts: providerSyncCountsSchema,
  changes: z.array(providerSyncChangeSchema),
  externalCalls: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  expiresAt: z.string().datetime(),
});

export const providerSyncJobResponseSchema = z.object({
  id: z.string().uuid(),
  operation: providerSyncOperationSchema,
  changeSetId: z.string().uuid(),
  snapshotId: z.string().uuid().nullable(),
  status: z.enum(["queued", "running", "succeeded", "partially_failed", "stale", "failed", "interrupted", "recovered"]),
  attemptCount: z.number().int().nonnegative(),
  heartbeatAt: z.string().datetime().nullable(),
  nextAttemptAt: z.string().datetime(),
  synced: z.number().int().nonnegative().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  auditId: z.string().uuid().nullable(),
  errorCode: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});

export const providerSyncJobPathSchema = z.object({ id: z.string().uuid() });
