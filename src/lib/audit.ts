import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("audit");

export interface AuditLogParams {
  actorType: "user" | "agent" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
}

const REDACTED = "[redacted]";
const SUMMARIZED = "[summarized]";

function isSensitiveKey(key: string): boolean {
  return /(api.?key|access.?token|refresh.?token|id.?token|secret|password|signature|authorization|cookie|phone|email|customer|discordid)/i.test(key);
}

function shouldSummarizeKey(key: string): boolean {
  return /(content|description|payload|raw|metadatajson|trustnotesjson|snapshot|body)/i.test(key);
}

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!local || !domain) return REDACTED;
  return `${local.slice(0, 2)}***@${domain}`;
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") return `${SUMMARIZED}:string:${value.length}`;
  if (Array.isArray(value)) return `${SUMMARIZED}:array:${value.length}`;
  if (value && typeof value === "object") return `${SUMMARIZED}:object`;
  return SUMMARIZED;
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (value == null) return value;

  if (isSensitiveKey(key)) {
    if (typeof value === "string" && value.includes("@")) return maskEmail(value);
    return REDACTED;
  }

  if (shouldSummarizeKey(key)) {
    return summarizeValue(value);
  }

  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  }

  if (typeof value !== "object") return value;
  if (depth >= 2) return summarizeValue(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeValue(childKey, childValue, depth + 1);
  }
  return output;
}

function sanitizeChanges(
  changes?: Record<string, { before: unknown; after: unknown }>,
): Record<string, { before: unknown; after: unknown }> | undefined {
  if (!changes) return undefined;
  return Object.fromEntries(
    Object.entries(changes).map(([field, change]) => [
      field,
      {
        before: sanitizeValue(field, change.before),
        after: sanitizeValue(field, change.after),
      },
    ]),
  );
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changes: sanitizeChanges(params.changes) ?? null,
      metadata: sanitizeMetadata(params.metadata) ?? null,
    });
  } catch (err) {
    // Audit log failure must not break the caller
    logger.error("Failed to write audit log", {
      error: err instanceof Error ? err.message : String(err),
      params: { ...params, changes: undefined },
    });
  }
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Persist business-critical audit evidence. Unlike telemetry-style audit
 * logging, failure is surfaced to the caller and must affect the operation
 * result instead of being silently ignored.
 */
export async function writeRequiredAuditLog(params: AuditLogParams): Promise<string> {
  const [row] = await db.insert(auditLogs).values({
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: sanitizeChanges(params.changes) ?? null,
    metadata: sanitizeMetadata(params.metadata) ?? null,
  }).returning({ id: auditLogs.id });

  if (!row) throw new Error("Required audit log was not persisted");
  return row.id;
}

/**
 * Persist required business evidence in the caller's transaction so the
 * mutation and its audit record either both commit or both roll back.
 */
export async function writeRequiredAuditLogInTransaction(
  tx: DbTransaction,
  params: AuditLogParams,
): Promise<string> {
  const [row] = await tx.insert(auditLogs).values({
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: sanitizeChanges(params.changes) ?? null,
    metadata: sanitizeMetadata(params.metadata) ?? null,
  }).returning({ id: auditLogs.id });

  if (!row) throw new Error("Required audit log was not persisted");
  return row.id;
}

/** Reuse the original operation evidence on an idempotent resource replay. */
export async function ensureRequiredAuditLogInTransaction(
  tx: DbTransaction,
  params: AuditLogParams,
): Promise<string> {
  const existing = await tx.query.auditLogs.findFirst({
    where: and(
      eq(auditLogs.actorType, params.actorType),
      eq(auditLogs.actorId, params.actorId),
      eq(auditLogs.action, params.action),
      eq(auditLogs.entityType, params.entityType),
      eq(auditLogs.entityId, params.entityId),
    ),
    columns: { id: true },
  });
  return existing?.id ?? writeRequiredAuditLogInTransaction(tx, params);
}

/**
 * Compute a diff between two objects for audit log changes field.
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> | undefined {
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b, after: a };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
