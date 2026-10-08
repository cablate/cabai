import { createHash } from "node:crypto";

export interface MigrationJournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export interface MigrationException {
  file: string;
  sha256: string;
  reason: string;
  reviewBlocker: string;
}

export interface MigrationSnapshot {
  id: string;
  prevId: string;
  version: string;
  dialect: string;
}

export interface MigrationInventory {
  entries: MigrationJournalEntry[];
  sqlFiles: Map<string, string>;
  snapshots: Map<string, MigrationSnapshot>;
  exceptions: MigrationException[];
}

export interface MigrationIssue {
  code: string;
  message: string;
}

const SQL_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const SNAPSHOT_FILE = /^(\d{4})_snapshot\.json$/;

export function sha256(content: string | Buffer): string {
  const canonicalText = content.toString("utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

export function validateMigrationInventory(inventory: MigrationInventory): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  const { entries, sqlFiles, snapshots, exceptions } = inventory;

  if (entries.length === 0) {
    issues.push({ code: "EMPTY_JOURNAL", message: "Migration journal has no entries." });
    return issues;
  }

  const indices = new Set<number>();
  const tags = new Set<string>();

  entries.forEach((entry, position) => {
    if (indices.has(entry.idx)) {
      issues.push({ code: "DUPLICATE_JOURNAL_INDEX", message: `Journal index ${entry.idx} appears more than once.` });
    }
    if (tags.has(entry.tag)) {
      issues.push({ code: "DUPLICATE_JOURNAL_TAG", message: `Journal tag ${entry.tag} appears more than once.` });
    }
    indices.add(entry.idx);
    tags.add(entry.tag);

    if (entry.idx !== position) {
      issues.push({ code: "NON_CONTIGUOUS_INDEX", message: `Journal position ${position} uses idx ${entry.idx}.` });
    }

    if (position > 0 && entry.when <= entries[position - 1]!.when) {
      issues.push({ code: "NON_MONOTONIC_TIMESTAMP", message: `Journal timestamp for ${entry.tag} is not strictly increasing.` });
    }

    const sqlFile = `${entry.tag}.sql`;
    if (!sqlFiles.has(sqlFile)) {
      issues.push({ code: "MISSING_SQL", message: `Journal tag ${entry.tag} has no ${sqlFile}.` });
    }

    const snapshotFile = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
    if (!snapshots.has(snapshotFile)) {
      issues.push({ code: "MISSING_SNAPSHOT", message: `Journal tag ${entry.tag} has no ${snapshotFile}.` });
    }
  });

  const snapshotIds = new Set<string>();
  let previousSnapshotId = "00000000-0000-0000-0000-000000000000";
  const orderedSnapshots = [...snapshots.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [snapshotFile, snapshot] of orderedSnapshots) {
    const match = SNAPSHOT_FILE.exec(snapshotFile);
    if (!match) continue;
    const idx = Number(match[1]);
    if (!indices.has(idx)) {
      issues.push({ code: "ORPHAN_SNAPSHOT", message: `Snapshot ${snapshotFile} has no journal entry.` });
    }
    if (snapshotIds.has(snapshot.id)) {
      issues.push({ code: "DUPLICATE_SNAPSHOT_ID", message: `Snapshot id ${snapshot.id} appears more than once.` });
    }
    snapshotIds.add(snapshot.id);
    if (snapshot.prevId !== previousSnapshotId) {
      issues.push({ code: "BROKEN_SNAPSHOT_CHAIN", message: `${snapshotFile} prevId does not match the previous snapshot id.` });
    }
    if (snapshot.version !== "7" || snapshot.dialect !== "postgresql") {
      issues.push({ code: "SNAPSHOT_FORMAT_MISMATCH", message: `${snapshotFile} must use Drizzle version 7 and postgresql dialect.` });
    }
    previousSnapshotId = snapshot.id;
  }

  const exceptionByFile = new Map(exceptions.map((exception) => [exception.file, exception]));
  const prefixOwners = new Map<string, string[]>();

  for (const [file, content] of sqlFiles) {
    const match = SQL_FILE.exec(file);
    if (!match) {
      issues.push({ code: "INVALID_SQL_FILENAME", message: `Unexpected migration SQL filename: ${file}.` });
      continue;
    }

    const prefix = match[1]!;
    prefixOwners.set(prefix, [...(prefixOwners.get(prefix) ?? []), file]);

    if (tags.has(file.slice(0, -4))) continue;

    const exception = exceptionByFile.get(file);
    if (!exception) {
      issues.push({ code: "UNJOURNALED_SQL", message: `SQL file ${file} is not present in the journal.` });
      continue;
    }

    if (!exception.reason.trim() || !exception.reviewBlocker.trim()) {
      issues.push({ code: "INCOMPLETE_EXCEPTION", message: `Exception for ${file} must include reason and reviewBlocker.` });
    }
    if (sha256(content) !== exception.sha256.toLowerCase()) {
      issues.push({ code: "EXCEPTION_HASH_MISMATCH", message: `Exception hash does not match ${file}.` });
    }
  }

  for (const exception of exceptions) {
    if (!sqlFiles.has(exception.file)) {
      issues.push({ code: "STALE_EXCEPTION", message: `Exception references missing file ${exception.file}.` });
    }
  }

  for (const [prefix, files] of prefixOwners) {
    if (files.length <= 1) continue;
    const unjournaled = files.filter((file) => !tags.has(file.slice(0, -4)));
    const allExplicit = unjournaled.every((file) => exceptionByFile.has(file));
    if (!allExplicit) {
      issues.push({ code: "DUPLICATE_SQL_PREFIX", message: `Migration prefix ${prefix} is shared by: ${files.join(", ")}.` });
    }
  }

  return issues;
}
