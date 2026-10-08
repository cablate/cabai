/**
 * Backup Guard — Layer 1: SQL snapshot before dangerous operations.
 *
 * Rule: 跑任何會造成大災害的東西之前都一定要先 snapshot。
 *       如果 snapshot 沒有成功就直接停下來，絕對不准沒 backup 就跑。
 *
 * 機制：把受影響的表 snapshot 成 JSONB 存進 operation_snapshots 表。
 * 不依賴 pg_dump、R2、外部服務。純 SQL，秒級完成。
 */

import { db } from "@/lib/db";
import { operationSnapshots } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger("backup-guard");

export class SnapshotFailedError extends Error {
  constructor(reason: string) {
    super(`Snapshot failed — refusing to proceed. Reason: ${reason}`);
    this.name = "SnapshotFailedError";
  }
}

/**
 * Which tables each operation needs to snapshot.
 */
const OPERATION_TABLES: Record<string, string[]> = {
  "rebuild-orders": ["entitlement_outbox", "user_purchases", "orders"],
  "reconcile-subscriptions": ["entitlement_outbox", "user_purchases", "orders"],
  "sync-plans": ["plans"],
  "delete-course": ["courses", "chapters", "lessons"],
};

/**
 * Take a SQL snapshot of affected tables before a dangerous operation.
 * Stores the snapshot in operation_snapshots table.
 *
 * @returns snapshot ID — use for rollback if needed
 * @throws SnapshotFailedError if snapshot fails (caller MUST NOT proceed)
 */
export async function requireSnapshotBefore(
  operation: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const tables = OPERATION_TABLES[operation];
  if (!tables || tables.length === 0) {
    throw new SnapshotFailedError(`Unknown operation: ${operation}. Register it in OPERATION_TABLES.`);
  }

  logger.info("Taking pre-operation snapshot", { operation, tables });

  try {
    // Snapshot each table as JSONB array
    const tablesData: Record<string, unknown> = {};
    for (const table of tables) {
      const rows = await db.execute(sql.raw(
        `SELECT jsonb_agg(row_to_json(t)) AS data FROM "${table}" t`,
      ));
      tablesData[table] = (rows.rows[0] as Record<string, unknown>)?.data ?? [];
    }

    // Store snapshot
    const [record] = await db.insert(operationSnapshots).values({
      operation,
      tablesData,
      metadata: metadata ?? null,
    }).returning({ id: operationSnapshots.id });

    if (!record) throw new Error("Insert returned no rows");

    logger.info("Snapshot created", {
      operation,
      snapshotId: record.id,
      tables: Object.keys(tablesData),
    });

    return record.id;
  } catch (err) {
    if (err instanceof SnapshotFailedError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("SNAPSHOT FAILED — operation blocked", { operation, error: reason });
    throw new SnapshotFailedError(reason);
  }
}

/**
 * Restore tables from a snapshot. USE WITH CAUTION.
 * Truncates affected tables and re-inserts from snapshot data.
 *
 * @param snapshotId — the snapshot to restore from
 */
export async function restoreFromSnapshot(snapshotId: string): Promise<{
  operation: string;
  tablesRestored: string[];
}> {
  const snapshot = await db.query.operationSnapshots.findFirst({
    where: sql`${operationSnapshots.id} = ${snapshotId}`,
  });

  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

  const tablesData = snapshot.tablesData as Record<string, unknown[]>;
  const tablesRestored: string[] = [];

  await db.transaction(async (tx) => {
    const entries = Object.entries(tablesData).filter(([, rows]) => Array.isArray(rows));
    for (const [table] of entries) {
      // Delete every snapshotted table, including tables that were empty.
      await tx.execute(sql.raw(`DELETE FROM "${table}"`));
    }
    for (const [table, rows] of entries.reverse()) {
      if (!Array.isArray(rows)) continue;

      // Re-insert row by row (safe for any schema)
      for (const row of rows) {
        const keys = Object.keys(row as Record<string, unknown>);
        const values = keys.map((k) => {
          const v = (row as Record<string, unknown>)[k];
          if (v === null) return "NULL";
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        await tx.execute(sql.raw(
          `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING`,
        ));
      }

      tablesRestored.push(table);
    }
  });

  logger.info("Snapshot restored", { snapshotId, operation: snapshot.operation, tablesRestored });

  return { operation: snapshot.operation, tablesRestored };
}

/**
 * List recent snapshots.
 */
export async function listSnapshots(limit = 10): Promise<Array<{
  id: string;
  operation: string;
  createdAt: Date;
}>> {
  const rows = await db
    .select({
      id: operationSnapshots.id,
      operation: operationSnapshots.operation,
      createdAt: operationSnapshots.createdAt,
    })
    .from(operationSnapshots)
    .orderBy(sql`created_at DESC`)
    .limit(limit);
  return rows;
}
