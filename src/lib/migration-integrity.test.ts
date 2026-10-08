import { describe, expect, it } from "vitest";
import { sha256, validateMigrationInventory, type MigrationInventory } from "./migration-integrity";

function inventory(overrides: Partial<MigrationInventory> = {}): MigrationInventory {
  const sql = "CREATE TABLE example (id text primary key);\n";
  return {
    entries: [{ idx: 0, tag: "0000_initial", when: 100 }],
    sqlFiles: new Map([["0000_initial.sql", sql]]),
    snapshots: new Map([["0000_snapshot.json", {
      id: "snapshot-0",
      prevId: "00000000-0000-0000-0000-000000000000",
      version: "7",
      dialect: "postgresql",
    }]]),
    exceptions: [],
    ...overrides,
  };
}

describe("validateMigrationInventory", () => {
  it("migration hash / LF and CRLF checkouts / produces the same canonical hash", () => {
    expect(sha256("SELECT 1;\n")).toBe(sha256(Buffer.from("SELECT 1;\r\n", "utf8")));
    expect(sha256("SELECT 1;\n")).not.toBe(sha256("SELECT 2;\n"));
  });

  it("migration inventory / journaled SQL and snapshot / passes", () => {
    expect(validateMigrationInventory(inventory())).toEqual([]);
  });

  it("migration inventory / unjournaled SQL / reports the drift", () => {
    const current = inventory();
    current.sqlFiles.set("0001_orphan.sql", "SELECT 1;\n");

    expect(validateMigrationInventory(current)).toContainEqual(
      expect.objectContaining({ code: "UNJOURNALED_SQL" }),
    );
  });

  it("migration inventory / exact historical exception / allows the orphan", () => {
    const current = inventory();
    const content = "SELECT 1;\n";
    current.sqlFiles.set("0000_historical.sql", content);
    current.exceptions.push({
      file: "0000_historical.sql",
      sha256: sha256(content),
      reason: "Known historical file.",
      reviewBlocker: "Inspect deployed migration tables.",
    });

    expect(validateMigrationInventory(current)).toEqual([]);
  });

  it("migration inventory / changed excepted file / rejects the stale hash", () => {
    const current = inventory();
    current.sqlFiles.set("0000_historical.sql", "SELECT 2;\n");
    current.exceptions.push({
      file: "0000_historical.sql",
      sha256: sha256("SELECT 1;\n"),
      reason: "Known historical file.",
      reviewBlocker: "Inspect deployed migration tables.",
    });

    expect(validateMigrationInventory(current)).toContainEqual(
      expect.objectContaining({ code: "EXCEPTION_HASH_MISMATCH" }),
    );
  });

  it("migration inventory / missing reverse evidence / reports SQL and snapshot gaps", () => {
    expect(
      validateMigrationInventory(inventory({ sqlFiles: new Map(), snapshots: new Map() })).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining(["MISSING_SQL", "MISSING_SNAPSHOT"]));
  });

  it("migration inventory / broken snapshot chain / rejects the snapshot", () => {
    const current = inventory();
    current.entries.push({ idx: 1, tag: "0001_next", when: 200 });
    current.sqlFiles.set("0001_next.sql", "SELECT 1;\n");
    current.snapshots.set("0001_snapshot.json", {
      id: "snapshot-1",
      prevId: "wrong-parent",
      version: "7",
      dialect: "postgresql",
    });

    expect(validateMigrationInventory(current)).toContainEqual(
      expect.objectContaining({ code: "BROKEN_SNAPSHOT_CHAIN" }),
    );
  });
});
