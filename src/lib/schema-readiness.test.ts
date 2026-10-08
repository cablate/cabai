import { describe, expect, it, vi } from "vitest";
import { inspectSchemaReadiness, requiredSchemaMigration } from "./schema-readiness";

function queryable(rows: Array<{ hash: string; created_at: string }>) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe("schema readiness", () => {
  it("accepts exactly one latest tracked migration row", async () => {
    const required = requiredSchemaMigration();
    const client = queryable([{ hash: required.hash, created_at: required.createdAt }]);

    await expect(inspectSchemaReadiness(client)).resolves.toMatchObject({
      current: true,
      requiredTag: required.tag,
      code: "SCHEMA_CURRENT",
      hashStatus: "exact",
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("drizzle.__drizzle_migrations"), [
      required.createdAt,
    ]);
  });

  it("rejects a stale or duplicate latest migration row", async () => {
    const required = requiredSchemaMigration();

    await expect(inspectSchemaReadiness(queryable([]))).resolves.toMatchObject({
      current: false,
      code: "SCHEMA_NOT_CURRENT",
    });
    await expect(inspectSchemaReadiness(queryable([
      { hash: required.hash, created_at: required.createdAt },
      { hash: required.hash, created_at: required.createdAt },
    ]))).resolves.toMatchObject({
      current: false,
      code: "SCHEMA_NOT_CURRENT",
    });
  });

  it("rejects an unreviewed latest hash without leaking the value", async () => {
    const result = await inspectSchemaReadiness(queryable([{
      hash: "postgresql://user:secret@example.invalid/database",
      created_at: requiredSchemaMigration().createdAt,
    }]));

    expect(result).toMatchObject({ current: false, code: "SCHEMA_HASH_MISMATCH" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reports an unavailable ledger without exposing the database error", async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error("password=secret")) };

    const result = await inspectSchemaReadiness(client);

    expect(result).toMatchObject({ current: false, code: "SCHEMA_LEDGER_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
