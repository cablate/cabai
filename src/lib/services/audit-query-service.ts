import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";

const MAX_PAGE_SIZE = 50;

export type AuditCursor = { createdAt: string; id: string };

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string | undefined): AuditCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuditCursor>;
    const date = new Date(parsed.createdAt ?? "");
    if (!parsed.id || !Number.isFinite(date.getTime())) return null;
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export async function listAuditPage(input: {
  cursor?: string;
  pageSize?: number;
  action?: string;
  entityType?: string;
  actorType?: "user" | "agent" | "system";
}) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? MAX_PAGE_SIZE));
  const cursor = decodeAuditCursor(input.cursor);
  const conditions: SQL[] = [];
  if (input.action) conditions.push(eq(auditLogs.action, input.action));
  if (input.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
  if (input.actorType) conditions.push(eq(auditLogs.actorType, input.actorType));
  if (cursor) {
    const createdAt = new Date(cursor.createdAt);
    conditions.push(or(
      lt(auditLogs.createdAt, createdAt),
      and(eq(auditLogs.createdAt, createdAt), lt(auditLogs.id, cursor.id)),
    )!);
  }

  const rows = await db.select({
    id: auditLogs.id,
    actorType: auditLogs.actorType,
    actorId: auditLogs.actorId,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    changes: auditLogs.changes,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
    actorName: users.name,
    actorEmail: users.email,
  }).from(auditLogs)
    .leftJoin(users, and(eq(auditLogs.actorType, "user"), eq(auditLogs.actorId, users.id)))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeAuditCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null,
  };
}
