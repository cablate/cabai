#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  validateMigrationInventory,
  type MigrationException,
  type MigrationJournalEntry,
  type MigrationSnapshot,
} from "../src/lib/migration-integrity";

const projectRoot = join(import.meta.dirname, "..");
const drizzleDir = join(projectRoot, "drizzle");
const metaDir = join(drizzleDir, "meta");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const journal = readJson<{ entries: MigrationJournalEntry[] }>(join(metaDir, "_journal.json"));
const exceptionConfig = readJson<{ orphanSql?: MigrationException[] }>(join(drizzleDir, "migration-exceptions.json"));
const sqlFiles = new Map(
  readdirSync(drizzleDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => [file, readFileSync(join(drizzleDir, file), "utf8")]),
);
const snapshots = new Map(
  readdirSync(metaDir)
    .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
    .map((file) => [file, readJson<MigrationSnapshot>(join(metaDir, file))]),
);

const issues = validateMigrationInventory({
  entries: journal.entries,
  sqlFiles,
  snapshots,
  exceptions: exceptionConfig.orphanSql ?? [],
});

if (issues.length > 0) {
  for (const issue of issues) console.error(`[check-migrations] ${issue.code}: ${issue.message}`);
  process.exit(1);
}

for (const exception of exceptionConfig.orphanSql ?? []) {
  console.warn(`[check-migrations] HISTORICAL_EXCEPTION: ${exception.file} — ${exception.reviewBlocker}`);
}
console.log(`[check-migrations] OK: ${journal.entries.length} journal entries, ${sqlFiles.size} SQL files, ${snapshots.size} snapshots.`);
