import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { createBackupSinkFromEnv } from "../src/lib/backup";

interface TableSummary {
  table: string;
  rows: number;
  timeColumn?: string;
  oldest?: string;
  newest?: string;
}

const timestampPreference = [
  "created_at",
  "occurred_at",
  "started_at",
  "finished_at",
  "updated_at",
] as const;

function unquote(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replaceAll('""', '"')
    : trimmed;
}

function normalizeTimestamp(value: string): string | undefined {
  if (!value || value === "\\N") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function main(): Promise<void> {
  const sink = createBackupSinkFromEnv();
  const [latest] = await sink.list();
  if (!latest) throw new Error("No committed database backup is available.");

  const summaries: TableSummary[] = [];
  const compressed = await sink.open(latest.artifactId);
  const lines = createInterface({ input: compressed.pipe(createGunzip()), crlfDelay: Infinity });
  let active: (TableSummary & { timestampIndex?: number }) | undefined;

  for await (const line of lines) {
    if (!active) {
      const match = /^COPY public\.([^ ]+) \((.+)\) FROM stdin;$/.exec(line);
      if (!match) continue;
      const columns = match[2]!.split(",").map(unquote);
      const timeColumn = timestampPreference.find((column) => columns.includes(column));
      active = {
        table: unquote(match[1]!),
        rows: 0,
        timeColumn,
        timestampIndex: timeColumn ? columns.indexOf(timeColumn) : undefined,
      };
      continue;
    }

    if (line === "\\.") {
      summaries.push(active);
      active = undefined;
      continue;
    }

    active.rows += 1;
    if (active.timestampIndex === undefined) continue;
    const timestamp = normalizeTimestamp(line.split("\t")[active.timestampIndex] ?? "");
    if (!timestamp) continue;
    if (!active.oldest || timestamp < active.oldest) active.oldest = timestamp;
    if (!active.newest || timestamp > active.newest) active.newest = timestamp;
  }

  const rows = summaries
    .filter((summary) => summary.rows > 0)
    .sort((left, right) => right.rows - left.rows)
    .map(({ table, rows, timeColumn, oldest, newest }) => ({ table, rows, timeColumn, oldest, newest }));

  console.log(JSON.stringify({
    artifactId: latest.artifactId,
    createdAt: latest.createdAt,
    compressedBytes: latest.byteLength,
    migrationTag: latest.migrationTag,
    tables: rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
