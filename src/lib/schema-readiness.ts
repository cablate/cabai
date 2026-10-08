import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import journal from "../../drizzle/meta/_journal.json";
import exceptionConfig from "../../drizzle/applied-migration-exceptions.json";
import { dbPool } from "@/lib/db";

interface Queryable {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ hash: string; created_at: string }> }>;
}

export type SchemaReadinessCode =
  | "SCHEMA_CURRENT"
  | "SCHEMA_LEDGER_UNAVAILABLE"
  | "SCHEMA_NOT_CURRENT"
  | "SCHEMA_HASH_MISMATCH";

export interface SchemaReadiness {
  current: boolean;
  requiredTag: string;
  code: SchemaReadinessCode;
  hashStatus?: "exact" | "reviewed";
}

const migrationsFolder = join(process.cwd(), "drizzle");
const migrations = readMigrationFiles({ migrationsFolder });
const expectedLatest = migrations.at(-1);
const journalLatest = journal.entries.at(-1);

if (!expectedLatest || !journalLatest || String(expectedLatest.folderMillis) !== String(journalLatest.when)) {
  throw new Error("Migration inventory is missing or inconsistent.");
}

const requiredMigration = {
  tag: journalLatest.tag,
  hash: expectedLatest.hash,
  createdAt: String(expectedLatest.folderMillis),
};

const reviewedLatestHashes = new Set(
  exceptionConfig.exceptions.flatMap((exception) => (
    exception.kind === "canonical-hash-variant"
    && exception.schema === exceptionConfig.canonicalSchema
    && exception.expectedTag === requiredMigration.tag
    && exception.createdAt === requiredMigration.createdAt
      ? [exception.hash]
      : []
  )),
);

export function requiredSchemaMigration(): Readonly<typeof requiredMigration> {
  return requiredMigration;
}

export async function inspectSchemaReadiness(
  queryable: Queryable = dbPool,
): Promise<SchemaReadiness> {
  let result;
  try {
    result = await queryable.query(
      `SELECT hash, created_at::text AS created_at
       FROM drizzle.__drizzle_migrations
       WHERE created_at = $1::bigint
       ORDER BY id`,
      [requiredMigration.createdAt],
    );
  } catch {
    return {
      current: false,
      requiredTag: requiredMigration.tag,
      code: "SCHEMA_LEDGER_UNAVAILABLE",
    };
  }

  if (result.rows.length !== 1) {
    return {
      current: false,
      requiredTag: requiredMigration.tag,
      code: "SCHEMA_NOT_CURRENT",
    };
  }

  const appliedHash = String(result.rows[0]!.hash);
  if (appliedHash === requiredMigration.hash) {
    return {
      current: true,
      requiredTag: requiredMigration.tag,
      code: "SCHEMA_CURRENT",
      hashStatus: "exact",
    };
  }
  if (reviewedLatestHashes.has(appliedHash)) {
    return {
      current: true,
      requiredTag: requiredMigration.tag,
      code: "SCHEMA_CURRENT",
      hashStatus: "reviewed",
    };
  }
  return {
    current: false,
    requiredTag: requiredMigration.tag,
    code: "SCHEMA_HASH_MISMATCH",
  };
}
