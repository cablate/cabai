import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  inspectAppliedMigrations,
  type AppliedMigrationException,
  type AppliedMigrationRow,
  type ExpectedAppliedMigration,
} from "./applied-migration-integrity";

const expected: ExpectedAppliedMigration[] = [
  { tag: "0000_initial", hash: "current-0000", createdAt: "100" },
  { tag: "0001_next", hash: "current-0001", createdAt: "200" },
];

function row(overrides: Partial<AppliedMigrationRow> = {}): AppliedMigrationRow {
  return {
    schema: "drizzle",
    id: 1,
    hash: "current-0000",
    createdAt: "100",
    ...overrides,
  };
}

describe("inspectAppliedMigrations", () => {
  it("accepts an exact canonical ledger", () => {
    const result = inspectAppliedMigrations({
      expected,
      applied: [row(), row({ id: 2, hash: "current-0001", createdAt: "200" })],
      exceptions: [],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((finding) => finding.code === "EXACT_MATCH")).toBe(true);
  });

  it("accepts an exact reviewed canonical hash variant", () => {
    const exceptions: AppliedMigrationException[] = [{
      kind: "canonical-hash-variant",
      schema: "drizzle",
      hash: "legacy-0001",
      createdAt: "200",
      expectedTag: "0001_next",
      reason: "Applied before the tracked SQL was frozen.",
      evidence: "docs/evidence/example.md",
    }];
    const result = inspectAppliedMigrations({
      expected,
      applied: [row(), row({ id: 2, hash: "legacy-0001", createdAt: "200" })],
      exceptions,
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "KNOWN_CANONICAL_HASH_VARIANT",
      expectedTag: "0001_next",
    }));
  });

  it("maps one reviewed historical timestamp variant without also reporting it missing or extra", () => {
    const exceptions: AppliedMigrationException[] = [{
      kind: "canonical-applied-variant",
      schema: "drizzle",
      expectedTag: "0001_next",
      expectedHash: "current-0001",
      expectedCreatedAt: "200",
      observedHash: "current-0001",
      observedCreatedAt: "50",
      reason: "The original journal timestamp predated the initial migration.",
      evidence: "docs/evidence/example.md",
    }];
    const result = inspectAppliedMigrations({
      expected,
      applied: [row(), row({ id: 2, hash: "current-0001", createdAt: "50" })],
      exceptions,
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "KNOWN_CANONICAL_APPLIED_VARIANT",
      expectedTag: "0001_next",
    }));
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "EXPECTED_MIGRATION_MISSING", expectedTag: "0001_next" }),
      expect.objectContaining({ code: "UNEXPECTED_CANONICAL_ENTRY", expectedTag: "0001_next" }),
    ]));
  });

  it("rejects an unreviewed canonical hash mismatch", () => {
    const result = inspectAppliedMigrations({
      expected,
      applied: [row(), row({ id: 2, hash: "unknown", createdAt: "200" })],
      exceptions: [],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "CANONICAL_HASH_MISMATCH" }));
  });

  it("accepts a reviewed legacy ledger and rejects unknown legacy rows", () => {
    const legacy = row({ schema: "public", id: 4, hash: "manual-marker", createdAt: "250" });
    const exception: AppliedMigrationException = {
      kind: "legacy-ledger-entry",
      schema: "public",
      hash: "manual-marker",
      createdAt: "250",
      reason: "Reviewed manual marker.",
      evidence: "docs/evidence/example.md",
    };
    const canonical = [row(), row({ id: 2, hash: "current-0001", createdAt: "200" })];

    expect(inspectAppliedMigrations({ expected, applied: [...canonical, legacy], exceptions: [exception] }).ok).toBe(true);
    expect(inspectAppliedMigrations({
      expected,
      applied: [...canonical, { ...legacy, hash: "unknown" }],
      exceptions: [exception],
    }).findings).toContainEqual(expect.objectContaining({ code: "UNREVIEWED_LEGACY_LEDGER_ENTRY" }));
  });

  it("does not allow a legacy-ledger exception to hide an unexpected canonical row", () => {
    const canonicalExtra = row({ id: 3, hash: "manual-marker", createdAt: "250" });
    const exception: AppliedMigrationException = {
      kind: "legacy-ledger-entry",
      schema: "drizzle",
      hash: "manual-marker",
      createdAt: "250",
      reason: "This must not be accepted inside the canonical ledger.",
      evidence: "docs/evidence/example.md",
    };
    const result = inspectAppliedMigrations({
      expected,
      applied: [row(), row({ id: 2, hash: "current-0001", createdAt: "200" }), canonicalExtra],
      exceptions: [exception],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "UNEXPECTED_CANONICAL_ENTRY",
      hash: "manual-marker",
    }));
  });

  it("rejects a missing canonical ledger or expected migration", () => {
    expect(inspectAppliedMigrations({ expected, applied: [], exceptions: [] }).findings)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "CANONICAL_LEDGER_MISSING" }),
        expect.objectContaining({ code: "EXPECTED_MIGRATION_MISSING" }),
      ]));
  });

  it("accepts only the versioned production tuples for repaired 0001 and 0002 timestamps", () => {
    const config = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle/applied-migration-exceptions.json"),
      "utf8",
    )) as { exceptions: AppliedMigrationException[] };
    const productionExpected: ExpectedAppliedMigration[] = [
      {
        tag: "0000_chunky_dorian_gray",
        hash: "532f5c0c83223878fc1c075a44bf277e15b6feca3b58c4a8fa5132676653ca44",
        createdAt: "1778638872263",
      },
      {
        tag: "0001_service_configs_soft_delete",
        hash: "df271f1e6d132802e586020f53a776cbf70b00c77117cfa861d0faa0314bc029",
        createdAt: "1778638872264",
      },
      {
        tag: "0002_add_purchase_button_fields",
        hash: "a11a0c68ebd9c3ae6c9e587f102a9a967d7df00bfa1d169dd69664426a98a69b",
        createdAt: "1778638872265",
      },
    ];
    const productionObserved: AppliedMigrationRow[] = [
      {
        schema: "drizzle",
        id: 1,
        hash: productionExpected[0]!.hash,
        createdAt: "1778638872263",
      },
      {
        schema: "drizzle",
        id: 2,
        hash: productionExpected[1]!.hash,
        createdAt: "1779199735432",
      },
      {
        schema: "drizzle",
        id: 3,
        hash: productionExpected[2]!.hash,
        createdAt: "1779199735433",
      },
    ];

    const result = inspectAppliedMigrations({
      expected: productionExpected,
      applied: productionObserved,
      exceptions: config.exceptions,
    });

    expect(result.ok).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "EXACT_MATCH",
      "KNOWN_CANONICAL_APPLIED_VARIANT",
      "KNOWN_CANONICAL_APPLIED_VARIANT",
    ]);
  });
});
