import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";
import journal from "../../../drizzle/meta/_journal.json";
import { verifyBackupArtifact } from "./service";
import type { BackupManifest, BackupSink } from "./types";

export interface RestoreDrillReport {
  artifactId: string;
  targetDatabase: string;
  startedAt: string;
  finishedAt: string;
  checks: string[];
}

function identity(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
}

export function assertRestoreTarget(options: {
  targetUrl: string;
  confirmTarget: string;
  sourceUrl?: string;
  allowRemote?: boolean;
}): URL {
  const url = new URL(options.targetUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("Restore target must be PostgreSQL.");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+_restore_drill(?:_[A-Za-z0-9_]+)?$/.test(database)) {
    throw new Error("Restore target database name must contain the _restore_drill suffix.");
  }
  if (database !== options.confirmTarget) throw new Error("Target confirmation does not exactly match the database name.");
  if (options.sourceUrl && identity(options.sourceUrl) === identity(options.targetUrl)) throw new Error("Source and restore target are the same database.");
  if (!options.allowRemote && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Remote restore drill targets are disabled by default.");
  }
  return url;
}

export function assertPostgresCompatibility(targetMajor: number, manifest: Pick<BackupManifest, "sourcePostgresMajor" | "pgDumpMajor">): void {
  if (!Number.isInteger(targetMajor) || targetMajor < manifest.sourcePostgresMajor || targetMajor < manifest.pgDumpMajor) {
    throw new Error("Restore target PostgreSQL major is older than the source or pg_dump client.");
  }
}

function pgEnv(value: URL): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: value.hostname,
    PGPORT: value.port || "5432",
    PGUSER: decodeURIComponent(value.username),
    PGPASSWORD: decodeURIComponent(value.password),
    PGDATABASE: decodeURIComponent(value.pathname.slice(1)),
    ...(value.searchParams.get("sslmode") ? { PGSSLMODE: value.searchParams.get("sslmode")! } : {}),
  };
}

async function restoreWithPsql(sink: BackupSink, manifest: BackupManifest, target: URL): Promise<void> {
  const child = spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q"], {
    shell: false,
    env: pgEnv(target),
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += String(chunk); });
  await Promise.all([
    pipeline(await sink.open(manifest.artifactId), createGunzip(), child.stdin),
    new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`psql restore failed (${signal ?? code}): ${stderr.slice(0, 500)}`)));
    }),
  ]);
}

export async function runRestoreDrill(options: {
  sink: BackupSink;
  artifactId: string;
  targetUrl: string;
  confirmTarget: string;
  sourceUrl?: string;
  writesEnabled: boolean;
  allowRemote?: boolean;
}): Promise<RestoreDrillReport> {
  if (!options.writesEnabled) throw new Error("Restore writes are disabled. Set DB_RESTORE_WRITES_ENABLED=true explicitly.");
  const target = assertRestoreTarget(options);
  const manifest = await options.sink.readManifest(options.artifactId);
  const knownTags = new Set((journal.entries as Array<{ tag: string }>).map((entry) => entry.tag));
  if (!knownTags.has(manifest.migrationTag)) throw new Error("Backup migration tag is unknown or newer than this application.");
  await verifyBackupArtifact(options.sink, manifest);

  const client = new Client({ connectionString: options.targetUrl });
  await client.connect();
  try {
    const version = await client.query<{ server_version_num: string }>("SHOW server_version_num");
    const targetMajor = Math.floor(Number(version.rows[0]?.server_version_num) / 10000);
    assertPostgresCompatibility(targetMajor, manifest);
    const tables = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')");
    if (Number(tables.rows[0]?.count) !== 0) throw new Error("Restore target is not empty.");
  } finally {
    await client.end();
  }

  const startedAt = new Date().toISOString();
  await restoreWithPsql(options.sink, manifest, target);
  return {
    artifactId: manifest.artifactId,
    targetDatabase: decodeURIComponent(target.pathname.slice(1)),
    startedAt,
    finishedAt: new Date().toISOString(),
    checks: ["manifest", "sha256", "gzip", "dump-marker", "target-confirmed", "target-empty", "postgres-compatible", "restore"],
  };
}
