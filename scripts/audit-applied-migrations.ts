#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  inspectAppliedMigrations,
  type AppliedMigrationException,
  type AppliedMigrationRow,
} from "../src/lib/applied-migration-integrity";

const { Pool } = pg;
const projectRoot = join(import.meta.dirname, "..");
const databaseUrl = process.env.DATABASE_URL;
const jsonOutput = process.argv.includes("--json");
const target = process.env.MIGRATION_AUDIT_TARGET?.trim() || "unspecified";

if (!databaseUrl?.startsWith("postgres://") && !databaseUrl?.startsWith("postgresql://")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
}

const journal = JSON.parse(readFileSync(join(projectRoot, "drizzle/meta/_journal.json"), "utf8")) as {
  entries: Array<{ tag: string }>;
};
const expectedFiles = readMigrationFiles({ migrationsFolder: join(projectRoot, "drizzle") });
if (journal.entries.length !== expectedFiles.length) {
  throw new Error(`Migration journal/file count mismatch: ${journal.entries.length}/${expectedFiles.length}.`);
}

const exceptionConfig = JSON.parse(
  readFileSync(join(projectRoot, "drizzle/applied-migration-exceptions.json"), "utf8"),
) as {
  canonicalSchema: string;
  exceptions: AppliedMigrationException[];
};

const expected = expectedFiles.map((migration, index) => ({
  tag: journal.entries[index]!.tag,
  hash: migration.hash,
  createdAt: String(migration.folderMillis),
}));

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe migration schema name: ${value}`);
  return `"${value}"`;
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: "cabai-applied-migration-audit-readonly",
    statement_timeout: 10_000,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const schemaRows = await client.query<{ table_schema: string }>(`
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations'
    ORDER BY table_schema
  `);
    const applied: AppliedMigrationRow[] = [];

    for (const { table_schema: schema } of schemaRows.rows) {
      const rows = await client.query<{ id: number; hash: string; created_at: string | number }>(`
      SELECT id, hash, created_at
      FROM ${quoteIdentifier(schema)}.__drizzle_migrations
      ORDER BY created_at, id
    `);
      applied.push(...rows.rows.map((row) => ({
        schema,
        id: row.id,
        hash: String(row.hash),
        createdAt: String(row.created_at),
      })));
    }

    const inspection = inspectAppliedMigrations({
      expected,
      applied,
      exceptions: exceptionConfig.exceptions,
      canonicalSchema: exceptionConfig.canonicalSchema,
    });
    const report = {
      target,
      ok: inspection.ok,
      canonicalSchema: exceptionConfig.canonicalSchema,
      expectedCount: expected.length,
      ledgerSchemas: schemaRows.rows.map((row) => row.table_schema),
      findings: inspection.findings.map((finding) => ({
        ...finding,
        hash: finding.hash?.slice(0, 12),
      })),
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`[migration-audit] target=${target} expected=${expected.length} ledgers=${report.ledgerSchemas.join(",") || "none"}`);
      for (const finding of report.findings) {
        const tag = finding.expectedTag ? ` ${finding.expectedTag}` : "";
        console.log(`[migration-audit] ${finding.status.toUpperCase()} ${finding.code}${tag}: ${finding.message}`);
      }
      console.log(`[migration-audit] ${inspection.ok ? "PASS" : "FAIL"}`);
    }

    if (!inspection.ok) process.exitCode = 1;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
