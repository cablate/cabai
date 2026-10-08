#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertDatabaseSchemaCurrent,
  MigrationRuntimeError,
  runMigrations,
} from "./run-migrations.mjs";

const { Client } = pg;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedMigrations = join(projectRoot, "drizzle");
const allowCreate = process.env.MIGRATION_TEST_ALLOW_CREATE_DATABASES === "true";
const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
const foundationTables = [
  "library_entries",
  "skills",
  "skill_releases",
  "agent_information_items",
  "agent_information_events",
  "user_agent_information_reads",
];

function requireSafeAdminUrl() {
  if (!allowCreate) {
    throw new Error("Set MIGRATION_TEST_ALLOW_CREATE_DATABASES=true to create disposable databases.");
  }
  if (!adminUrl) throw new Error("MIGRATION_TEST_ADMIN_URL is required.");
  const parsed = new URL(adminUrl);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) {
    throw new Error("Migration matrix may run only against a loopback PostgreSQL server.");
  }
  return parsed;
}

function databaseUrl(base, databaseName) {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function withDatabase(databaseUrlValue, operation) {
  const client = new Client({
    connectionString: databaseUrlValue,
    application_name: "cabai-migration-matrix-probe",
  });
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertFoundationSchema(databaseUrlValue) {
  await withDatabase(databaseUrlValue, async (client) => {
    const tables = await client.query(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public' AND tablename = ANY($1::text[])
       ORDER BY tablename`,
      [foundationTables],
    );
    const actual = tables.rows.map((row) => row.tablename);
    const expected = [...foundationTables].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Foundation tables mismatch: expected=${expected.join(",")} actual=${actual.join(",")}`);
    }

    const scopeDefault = await client.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'user_api_tokens'
         AND column_name = 'scopes'`,
    );
    const value = scopeDefault.rows[0]?.column_default ?? "";
    for (const scope of ["course:read", "skill:read", "information:read", "information:ack"]) {
      if (!value.includes(scope)) {
        throw new Error(`User token scope default is missing ${scope}.`);
      }
    }
  });
}

async function writeLegacySentinel(databaseUrlValue, key, value) {
  await withDatabase(databaseUrlValue, async (client) => {
    await client.query(
      "INSERT INTO site_config (key, value) VALUES ($1, $2)",
      [key, value],
    );
  });
}

async function readLegacySentinel(databaseUrlValue, key) {
  return withDatabase(databaseUrlValue, async (client) => {
    const result = await client.query(
      "SELECT key, value, updated_at FROM site_config WHERE key = $1",
      [key],
    );
    return result.rows[0] ?? null;
  });
}

function quoteIdentifier(value) {
  if (!/^cabai_migration_test_[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database name.");
  return `"${value}"`;
}

async function createPreviousReleaseFixture() {
  const root = await mkdtemp(join(tmpdir(), "cabai-migrations-n-minus-one-"));
  const folder = join(root, "drizzle");
  await cp(trackedMigrations, folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length < 2) {
    throw new Error("At least two migrations are required for the N-1 fixture.");
  }
  const previous = journal.entries.at(-2);
  journal.entries.pop();
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  return { root, folder, previousTag: previous.tag };
}

async function expectStaleSchema(databaseUrlValue) {
  try {
    await assertDatabaseSchemaCurrent({ databaseUrl: databaseUrlValue });
  } catch (error) {
    if (error instanceof MigrationRuntimeError && error.code === "SCHEMA_NOT_CURRENT") return;
    throw error;
  }
  throw new Error("The current-schema assertion unexpectedly accepted an N-1 database.");
}

async function main() {
  const safeAdminUrl = requireSafeAdminUrl();
  const suffix = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  const names = {
    fresh: `cabai_migration_test_fresh_${suffix}`,
    rerun: `cabai_migration_test_rerun_${suffix}`,
    upgrade: `cabai_migration_test_upgrade_${suffix}`,
    concurrent: `cabai_migration_test_concurrent_${suffix}`,
    stale: `cabai_migration_test_stale_${suffix}`,
  };
  const admin = new Client({
    connectionString: safeAdminUrl.toString(),
    application_name: "cabai-migration-matrix",
  });
  const created = [];
  const previousFixture = await createPreviousReleaseFixture();

  try {
    await admin.connect();
    for (const name of Object.values(names)) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
      created.push(name);
    }

    const freshUrl = databaseUrl(safeAdminUrl, names.fresh);
    const fresh = await runMigrations({ databaseUrl: freshUrl });
    await assertFoundationSchema(freshUrl);
    console.log(`[migration-matrix] fresh install passed tag=${fresh.tag}`);

    const rerunUrl = databaseUrl(safeAdminUrl, names.rerun);
    await runMigrations({ databaseUrl: rerunUrl });
    await runMigrations({ databaseUrl: rerunUrl });
    console.log("[migration-matrix] latest rerun passed");

    const upgradeUrl = databaseUrl(safeAdminUrl, names.upgrade);
    await runMigrations({ databaseUrl: upgradeUrl, migrationsFolder: previousFixture.folder });
    const sentinelKey = `migration-sentinel-${suffix}`;
    const sentinelValue = `preserve-${randomBytes(8).toString("hex")}`;
    await writeLegacySentinel(upgradeUrl, sentinelKey, sentinelValue);
    const legacyBefore = await readLegacySentinel(upgradeUrl, sentinelKey);
    const upgraded = await runMigrations({ databaseUrl: upgradeUrl });
    const legacyAfter = await readLegacySentinel(upgradeUrl, sentinelKey);
    if (JSON.stringify(legacyAfter) !== JSON.stringify(legacyBefore)) {
      throw new Error("N-1 upgrade changed a legacy site_config row.");
    }
    await assertFoundationSchema(upgradeUrl);
    console.log(`[migration-matrix] N-1 upgrade passed from=${previousFixture.previousTag} to=${upgraded.tag}`);

    const concurrentUrl = databaseUrl(safeAdminUrl, names.concurrent);
    const results = await Promise.all([
      runMigrations({ databaseUrl: concurrentUrl }),
      runMigrations({ databaseUrl: concurrentUrl }),
    ]);
    if (!results.every((result) => result.tag === fresh.tag)) {
      throw new Error("Concurrent migration owners disagreed on the current schema.");
    }
    console.log("[migration-matrix] concurrent migration lock passed");

    const staleUrl = databaseUrl(safeAdminUrl, names.stale);
    await runMigrations({ databaseUrl: staleUrl, migrationsFolder: previousFixture.folder });
    await expectStaleSchema(staleUrl);
    console.log("[migration-matrix] stale schema rejection passed");
  } finally {
    if (!admin.ended) {
      for (const name of created.reverse()) {
        await admin.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [name],
        ).catch(() => undefined);
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`).catch(() => undefined);
      }
      await admin.end().catch(() => undefined);
    }
    await rm(previousFixture.root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const code = error instanceof MigrationRuntimeError ? error.code : "MIGRATION_MATRIX_FAILED";
  console.error(`[migration-matrix] ${code}: verification failed.`);
  process.exit(1);
});
