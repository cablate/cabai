export interface ExpectedAppliedMigration {
  tag: string;
  hash: string;
  createdAt: string;
}

export interface AppliedMigrationRow {
  schema: string;
  id: number;
  hash: string;
  createdAt: string;
}

interface AppliedMigrationExceptionBase {
  schema: string;
  reason: string;
  evidence: string;
}

export interface CanonicalHashVariantException extends AppliedMigrationExceptionBase {
  kind: "canonical-hash-variant";
  hash: string;
  createdAt: string;
  expectedTag: string;
}

export interface CanonicalAppliedVariantException extends AppliedMigrationExceptionBase {
  kind: "canonical-applied-variant";
  expectedTag: string;
  expectedHash: string;
  expectedCreatedAt: string;
  observedHash: string;
  observedCreatedAt: string;
}

export interface LegacyLedgerEntryException extends AppliedMigrationExceptionBase {
  kind: "legacy-ledger-entry";
  hash: string;
  createdAt?: string;
}

export type AppliedMigrationException =
  | CanonicalHashVariantException
  | CanonicalAppliedVariantException
  | LegacyLedgerEntryException;

export interface AppliedMigrationFinding {
  status: "exact" | "accepted-exception" | "error";
  code: string;
  schema: string;
  id?: number;
  hash?: string;
  createdAt?: string;
  expectedTag?: string;
  message: string;
}

export interface AppliedMigrationInspection {
  ok: boolean;
  findings: AppliedMigrationFinding[];
}

function hasReviewEvidence(exception: AppliedMigrationException): boolean {
  return Boolean(exception.reason.trim() && exception.evidence.trim());
}

function canonicalVariantMatches(
  exception: AppliedMigrationException,
  expected: ExpectedAppliedMigration,
  row: AppliedMigrationRow,
  canonicalSchema: string,
): boolean {
  if (!hasReviewEvidence(exception) || exception.schema !== canonicalSchema) return false;
  if (exception.kind === "canonical-hash-variant") {
    return exception.expectedTag === expected.tag
      && exception.createdAt === expected.createdAt
      && row.createdAt === exception.createdAt
      && row.hash === exception.hash;
  }
  if (exception.kind === "canonical-applied-variant") {
    return exception.expectedTag === expected.tag
      && exception.expectedHash === expected.hash
      && exception.expectedCreatedAt === expected.createdAt
      && row.hash === exception.observedHash
      && row.createdAt === exception.observedCreatedAt;
  }
  return false;
}

function legacyExceptionMatches(
  exception: AppliedMigrationException,
  row: AppliedMigrationRow,
): boolean {
  return exception.kind === "legacy-ledger-entry"
    && hasReviewEvidence(exception)
    && exception.schema === row.schema
    && exception.hash === row.hash
    && (exception.createdAt === undefined || exception.createdAt === row.createdAt);
}

export function inspectAppliedMigrations(input: {
  expected: ExpectedAppliedMigration[];
  applied: AppliedMigrationRow[];
  exceptions: AppliedMigrationException[];
  canonicalSchema?: string;
}): AppliedMigrationInspection {
  const canonicalSchema = input.canonicalSchema ?? "drizzle";
  const findings: AppliedMigrationFinding[] = [];
  const canonicalRows = input.applied.filter((row) => row.schema === canonicalSchema);
  const consumedCanonicalRows = new Set<number>();

  if (canonicalRows.length === 0) {
    findings.push({
      status: "error",
      code: "CANONICAL_LEDGER_MISSING",
      schema: canonicalSchema,
      message: `Canonical migration ledger ${canonicalSchema}.__drizzle_migrations was not found or is empty.`,
    });
  }

  for (const expected of input.expected) {
    const exactMatches = canonicalRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => !consumedCanonicalRows.has(index)
        && row.createdAt === expected.createdAt
        && row.hash === expected.hash);
    if (exactMatches.length > 1) {
      findings.push({
        status: "error",
        code: "DUPLICATE_CANONICAL_MIGRATION",
        schema: canonicalSchema,
        createdAt: expected.createdAt,
        expectedTag: expected.tag,
        message: `Canonical ledger contains multiple exact rows for ${expected.tag}.`,
      });
      continue;
    }
    if (exactMatches.length === 1) {
      const { row, index } = exactMatches[0]!;
      consumedCanonicalRows.add(index);
      findings.push({
        status: "exact",
        code: "EXACT_MATCH",
        schema: row.schema,
        id: row.id,
        hash: row.hash,
        createdAt: row.createdAt,
        expectedTag: expected.tag,
        message: `${expected.tag} matches the tracked migration hash.`,
      });
      continue;
    }

    const reviewedMatches = canonicalRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => !consumedCanonicalRows.has(index)
        && input.exceptions.some((exception) => canonicalVariantMatches(
          exception,
          expected,
          row,
          canonicalSchema,
        )));
    if (reviewedMatches.length > 1) {
      findings.push({
        status: "error",
        code: "AMBIGUOUS_CANONICAL_VARIANT",
        schema: canonicalSchema,
        createdAt: expected.createdAt,
        expectedTag: expected.tag,
        message: `Multiple reviewed rows could satisfy ${expected.tag}.`,
      });
      continue;
    }
    if (reviewedMatches.length === 1) {
      const { row, index } = reviewedMatches[0]!;
      consumedCanonicalRows.add(index);
      findings.push({
        status: "accepted-exception",
        code: row.createdAt === expected.createdAt
          ? "KNOWN_CANONICAL_HASH_VARIANT"
          : "KNOWN_CANONICAL_APPLIED_VARIANT",
        schema: row.schema,
        id: row.id,
        hash: row.hash,
        createdAt: row.createdAt,
        expectedTag: expected.tag,
        message: `${expected.tag} maps to one reviewed historical canonical row.`,
      });
      continue;
    }

    const sameTimestamp = canonicalRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => !consumedCanonicalRows.has(index)
        && row.createdAt === expected.createdAt);
    if (sameTimestamp.length === 1) {
      const { row, index } = sameTimestamp[0]!;
      consumedCanonicalRows.add(index);
      findings.push({
        status: "error",
        code: "CANONICAL_HASH_MISMATCH",
        schema: row.schema,
        id: row.id,
        hash: row.hash,
        createdAt: row.createdAt,
        expectedTag: expected.tag,
        message: `${expected.tag} has an unreviewed applied hash.`,
      });
      continue;
    }
    if (sameTimestamp.length > 1) {
      findings.push({
        status: "error",
        code: "DUPLICATE_CANONICAL_TIMESTAMP",
        schema: canonicalSchema,
        createdAt: expected.createdAt,
        expectedTag: expected.tag,
        message: `Canonical ledger contains multiple rows at the timestamp for ${expected.tag}.`,
      });
      continue;
    }

    findings.push({
      status: "error",
      code: "EXPECTED_MIGRATION_MISSING",
      schema: canonicalSchema,
      createdAt: expected.createdAt,
      expectedTag: expected.tag,
      message: `Expected migration ${expected.tag} has no exact or reviewed canonical row.`,
    });
  }

  for (const [index, row] of canonicalRows.entries()) {
    if (consumedCanonicalRows.has(index)) continue;
    findings.push({
      status: "error",
      code: "UNEXPECTED_CANONICAL_ENTRY",
      schema: row.schema,
      id: row.id,
      hash: row.hash,
      createdAt: row.createdAt,
      message: "Canonical ledger contains a row that does not map to a tracked migration.",
    });
  }

  for (const row of input.applied.filter((candidate) => candidate.schema !== canonicalSchema)) {
    const exception = input.exceptions.find((candidate) => legacyExceptionMatches(candidate, row));
    findings.push(exception
      ? {
          status: "accepted-exception",
          code: "KNOWN_LEGACY_LEDGER_ENTRY",
          schema: row.schema,
          id: row.id,
          hash: row.hash,
          createdAt: row.createdAt,
          message: `Reviewed legacy ledger entry: ${exception.reason}`,
        }
      : {
          status: "error",
          code: "UNREVIEWED_LEGACY_LEDGER_ENTRY",
          schema: row.schema,
          id: row.id,
          hash: row.hash,
          createdAt: row.createdAt,
          message: `Unreviewed migration entry exists in non-canonical schema ${row.schema}.`,
        });
  }

  return {
    ok: findings.every((finding) => finding.status !== "error"),
    findings,
  };
}
