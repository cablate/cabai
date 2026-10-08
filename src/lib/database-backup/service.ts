import { spawn } from "node:child_process";
import { createGunzip, createGzip } from "node:zlib";
import { PassThrough, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import journal from "../../../drizzle/meta/_journal.json";
import packageJson from "../../../package.json";
import { createArtifactId, HashAndCountTransform } from "./manifest";
import { assertRetentionCount } from "./retention";
import type { BackupManifest, BackupSink } from "./types";

function postgresEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("PostgreSQL URL required.");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}),
  };
}

async function commandOutput(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { if (stdout.length < 4096) stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { if (stderr.length < 4096) stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.slice(0, 500)}`)));
  });
}

export async function verifyBackupArtifact(sink: BackupSink, manifest: Pick<BackupManifest, "artifactId" | "sha256" | "byteLength">): Promise<void> {
  const source = await sink.open(manifest.artifactId);
  const hash = new HashAndCountTransform();
  let head = ""; let tail = "";
  const inspect = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const text = chunk.toString("utf8");
      if (head.length < 512) head += text.slice(0, 512 - head.length);
      tail = (tail + text).slice(-1024);
      callback();
    },
  });
  await pipeline(source, hash, createGunzip(), inspect);
  const result = hash.result();
  if (result.sha256 !== manifest.sha256 || result.byteLength !== manifest.byteLength) throw new Error("Backup checksum or length mismatch.");
  if (!head.includes("PostgreSQL database dump") || !tail.includes("PostgreSQL database dump complete")) {
    throw new Error("Backup does not contain a complete PostgreSQL plain dump.");
  }
}

export async function createDatabaseBackup(options: {
  databaseUrl: string;
  sink: BackupSink;
  now?: Date;
}): Promise<BackupManifest> {
  const now = options.now ?? new Date();
  const id = createArtifactId(now);
  const env = postgresEnv(options.databaseUrl);
  const versionText = await commandOutput("pg_dump", ["--version"], env);
  const pgDumpMajor = Number(versionText.match(/(\d+)(?:\.\d+)?/)?.[1]);
  const sourceText = await commandOutput("psql", ["-X", "-Atqc", "SHOW server_version_num"], env);
  const sourcePostgresMajor = Math.floor(Number(sourceText.trim()) / 10000);
  const appliedAt = await commandOutput("psql", ["-X", "-Atqc", "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1"], env);
  const entries = journal.entries as Array<{ tag: string; when: number }>;
  const appliedMigration = entries.find((entry) => String(entry.when) === appliedAt.trim());
  if (!Number.isInteger(pgDumpMajor) || !Number.isInteger(sourcePostgresMajor)) throw new Error("Unable to determine PostgreSQL versions.");
  if (!appliedMigration) throw new Error("Source database migration ledger does not match this application.");

  const child = spawn("pg_dump", ["--no-owner", "--no-acl", "--format=plain"], { shell: false, env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += String(chunk); });
  const hash = new HashAndCountTransform();
  const body = new PassThrough();
  const upload = options.sink.stage(id, body);
  try {
    await Promise.all([
      pipeline(child.stdout, createGzip({ level: 9 }), hash, body),
      upload,
      new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${signal ?? code}): ${stderr.slice(0, 500)}`)));
      }),
    ]);
    const digest = hash.result();
    const manifest: BackupManifest = {
      manifestVersion: "cabai-backup/v1",
      artifactId: id,
      format: "postgresql-plain-sql",
      compression: "gzip",
      byteLength: digest.byteLength,
      sha256: digest.sha256,
      createdAt: now.toISOString(),
      verifiedAt: now.toISOString(),
      appVersion: packageJson.version,
      ...(process.env.APP_COMMIT_SHA ? { appCommit: process.env.APP_COMMIT_SHA } : {}),
      migrationTag: appliedMigration.tag,
      sourcePostgresMajor,
      pgDumpMajor,
    };
    await verifyBackupArtifact(options.sink, manifest);
    manifest.verifiedAt = new Date().toISOString();
    await options.sink.commit(manifest);
    return manifest;
  } catch (error) {
    child.kill("SIGTERM");
    await options.sink.abort(id).catch(() => undefined);
    throw error;
  }
}

export async function applyRetention(sink: BackupSink, keep = 30, minimum = 3): Promise<string[]> {
  assertRetentionCount(keep, minimum);
  const manifests = await sink.list();
  if (manifests.length <= keep) return [];
  const removed = manifests.slice(keep);
  for (const manifest of removed) await sink.remove(manifest.artifactId);
  return removed.map((item) => item.artifactId);
}
