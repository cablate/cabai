#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const { Pool } = pg;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultMigrationsFolder = join(projectRoot, "drizzle");
const migrationLockName = "cabai:database-migrations";

export class MigrationRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MigrationRuntimeError";
    this.code = code;
  }
}

function requirePostgresUrl(value) {
  if (!value) {
    throw new MigrationRuntimeError("DATABASE_URL_MISSING", "DATABASE_URL is required.");
  }
  if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) {
    throw new MigrationRuntimeError("DATABASE_URL_INVALID", "DATABASE_URL must use PostgreSQL.");
  }
  return value;
}

function positiveInteger(value, fallback, key) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MigrationRuntimeError("MIGRATION_CONFIG_INVALID", `${key} must be a positive integer.`);
  }
  return parsed;
}

function expectedLatestMigration(migrationsFolder) {
  const migrations = readMigrationFiles({ migrationsFolder });
  const latest = migrations.at(-1);
  if (!latest) {
    throw new MigrationRuntimeError("MIGRATION_INVENTORY_EMPTY", "No tracked database migrations were found.");
  }
  return {
    hash: latest.hash,
    createdAt: String(latest.folderMillis),
  };
}

async function latestJournalTag(migrationsFolder) {
  try {
    const journal = JSON.parse(await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"));
    const latest = journal.entries?.at(-1);
    if (!latest?.tag || String(latest.when) === "") throw new Error("invalid journal");
    return { tag: String(latest.tag), createdAt: String(latest.when) };
  } catch {
    throw new MigrationRuntimeError("MIGRATION_INVENTORY_INVALID", "The migration journal is missing or invalid.");
  }
}

async function reviewedLatestHashes(migrationsFolder, expected) {
  try {
    const config = JSON.parse(
      await readFile(join(migrationsFolder, "applied-migration-exceptions.json"), "utf8"),
    );
    const hashes = new Set();
    for (const exception of config.exceptions ?? []) {
      if (
        exception.kind === "canonical-hash-variant"
        && exception.schema === (config.canonicalSchema ?? "drizzle")
        && exception.createdAt === expected.createdAt
        && exception.expectedTag === expected.tag
        && typeof exception.hash === "string"
        && exception.reason?.trim()
        && exception.evidence?.trim()
      ) {
        hashes.add(exception.hash);
      }
    }
    return hashes;
  } catch {
    return new Set();
  }
}

export async function assertSchemaCurrent(client, options = {}) {
  const migrationsFolder = resolve(options.migrationsFolder ?? defaultMigrationsFolder);
  const journalLatest = await latestJournalTag(migrationsFolder);
  const fileLatest = expectedLatestMigration(migrationsFolder);
  if (journalLatest.createdAt !== fileLatest.createdAt) {
    throw new MigrationRuntimeError(
      "MIGRATION_INVENTORY_INVALID",
      "The latest migration journal entry does not match the tracked SQL inventory.",
    );
  }

  let result;
  try {
    result = await client.query(
      `SELECT hash, created_at::text AS created_at
       FROM drizzle.__drizzle_migrations
       WHERE created_at = $1::bigint
       ORDER BY id`,
      [fileLatest.createdAt],
    );
  } catch {
    throw new MigrationRuntimeError(
      "SCHEMA_LEDGER_UNAVAILABLE",
      "The canonical migration ledger is not available.",
    );
  }

  if (result.rows.length !== 1) {
    throw new MigrationRuntimeError(
      "SCHEMA_NOT_CURRENT",
      `Required migration ${journalLatest.tag} is not applied exactly once.`,
    );
  }

  const appliedHash = String(result.rows[0].hash);
  if (appliedHash !== fileLatest.hash) {
    const reviewed = await reviewedLatestHashes(migrationsFolder, {
      ...journalLatest,
      hash: fileLatest.hash,
    });
    if (!reviewed.has(appliedHash)) {
      throw new MigrationRuntimeError(
        "SCHEMA_HASH_MISMATCH",
        `Required migration ${journalLatest.tag} has an unreviewed applied hash.`,
      );
    }
  }

  return {
    tag: journalLatest.tag,
    createdAt: journalLatest.createdAt,
    hashStatus: appliedHash === fileLatest.hash ? "exact" : "reviewed",
  };
}

async function acquireMigrationLock(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS locked",
      [migrationLockName],
    );
    if (result.rows[0]?.locked === true) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  } while (Date.now() < deadline);

  throw new MigrationRuntimeError(
    "MIGRATION_LOCK_TIMEOUT",
    `Another migration owner did not finish within ${timeoutMs}ms.`,
  );
}

function createPool(databaseUrl, applicationName) {
  return new Pool({
    connectionString: requirePostgresUrl(databaseUrl),
    application_name: applicationName,
    connectionTimeoutMillis: 10_000,
    max: 1,
  });
}

export async function assertDatabaseSchemaCurrent(options = {}) {
  const pool = createPool(options.databaseUrl ?? process.env.DATABASE_URL, "cabai-schema-readiness");
  let client;
  try {
    client = await pool.connect();
    return await assertSchemaCurrent(client, options);
  } catch (error) {
    if (error instanceof MigrationRuntimeError) throw error;
    throw new MigrationRuntimeError("DATABASE_UNAVAILABLE", "Database schema readiness could not be verified.");
  } finally {
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

export async function runMigrations(options = {}) {
  const migrationsFolder = resolve(options.migrationsFolder ?? defaultMigrationsFolder);
  const lockTimeoutMs = positiveInteger(
    options.lockTimeoutMs ?? process.env.MIGRATION_LOCK_TIMEOUT_MS,
    60_000,
    "MIGRATION_LOCK_TIMEOUT_MS",
  );
  const statementTimeoutMs = positiveInteger(
    options.statementTimeoutMs ?? process.env.MIGRATION_STATEMENT_TIMEOUT_MS,
    300_000,
    "MIGRATION_STATEMENT_TIMEOUT_MS",
  );
  const pool = createPool(options.databaseUrl ?? process.env.DATABASE_URL, "cabai-migration-runner");
  let client;
  let locked = false;

  try {
    client = await pool.connect();
    await acquireMigrationLock(client, lockTimeoutMs);
    locked = true;
    await client.query("SELECT set_config('statement_timeout', $1, false)", [String(statementTimeoutMs)]);
    await migrate(drizzle(client), { migrationsFolder });
    return await assertSchemaCurrent(client, { migrationsFolder });
  } catch (error) {
    if (error instanceof MigrationRuntimeError) throw error;
    throw new MigrationRuntimeError("MIGRATION_EXECUTION_FAILED", "Database migrations did not complete.");
  } finally {
    if (locked && client) {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended($1::text, 0))",
        [migrationLockName],
      ).catch(() => undefined);
    }
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  console.log("[migrate] waiting for the migration lock");
  try {
    const result = await runMigrations();
    console.log(`[migrate] schema current tag=${result.tag} hash=${result.hashStatus}`);
  } catch (error) {
    const code = error instanceof MigrationRuntimeError ? error.code : "MIGRATION_UNKNOWN_FAILURE";
    const message = error instanceof MigrationRuntimeError ? error.message : "Database migrations failed unexpectedly.";
    console.error(`[migrate] ${code}: ${message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
