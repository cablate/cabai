import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { listAuditPage } from "@/lib/services/audit-query-service";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) await db.delete(auditLogs).where(inArray(auditLogs.id, createdIds.splice(0)));
});

describe("audit query cursor", () => {
  it("returns bounded, stable pages without overlap and preserves filters", async () => {
    const prefix = `audit-cursor-${crypto.randomUUID()}`;
    const createdAt = new Date("2026-09-27T10:00:00.000Z");
    const rows = ["a", "b", "c"].map((suffix, index) => ({
      id: `${prefix}-${suffix}`,
      actorType: "agent" as const,
      actorId: "agent-test",
      action: index === 2 ? "delete" : "update",
      entityType: prefix,
      entityId: suffix,
      createdAt: new Date(createdAt.getTime() - index * 1000),
    }));
    createdIds.push(...rows.map((row) => row.id));
    await db.insert(auditLogs).values(rows);

    const first = await listAuditPage({ entityType: prefix, actorType: "agent", pageSize: 2 });
    expect(first.items.map((row) => row.id)).toEqual([rows[0]!.id, rows[1]!.id]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listAuditPage({ entityType: prefix, actorType: "agent", pageSize: 2, cursor: first.nextCursor! });
    expect(second.items.map((row) => row.id)).toEqual([rows[2]!.id]);
    expect(second.nextCursor).toBeNull();
  });
});
