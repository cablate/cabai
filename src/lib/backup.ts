/** Compatibility facade for the canonical sink-neutral database backup owner. */
import { LocalBackupSink } from "@/lib/database-backup/local-sink";
import { R2BackupSink } from "@/lib/database-backup/r2-sink";
import { applyRetention, createDatabaseBackup } from "@/lib/database-backup/service";
import { parseBackupRetention } from "@/lib/database-backup/retention";
import type { BackupSink } from "@/lib/database-backup/types";
import { resolveBackupProvider } from "@/lib/config/platform";
import { createLogger } from "@/lib/logger";

const logger = createLogger("backup");

export function createBackupSinkFromEnv(env: NodeJS.ProcessEnv = process.env): BackupSink {
  const resolution = resolveBackupProvider(env);
  if (resolution.state === "misconfigured") {
    throw new Error("Database backup provider configuration is invalid.");
  }
  if (resolution.provider === "local") return new LocalBackupSink(env.LOCAL_BACKUP_PATH || "./backups");
  if (resolution.provider === "r2") {
    return new R2BackupSink({
      accountId: env.CLOUDFLARE_ACCOUNT_ID || "",
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
      bucket: env.CLOUDFLARE_R2_BACKUP_BUCKET_NAME || "",
      prefix: env.DB_BACKUP_PREFIX,
    });
  }
  throw new Error("Database backups are disabled. Set BACKUP_PROVIDER=local|r2 explicitly.");
}

function assertWritesEnabled(env: NodeJS.ProcessEnv): void {
  if (env.DB_BACKUP_WRITES_ENABLED !== "true") {
    throw new Error("DB backup writes are disabled. Set DB_BACKUP_WRITES_ENABLED=true only on the canonical backup runner.");
  }
}

export async function runScheduledBackup(): Promise<{ created: number; removed: number }> {
  assertWritesEnabled(process.env);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  // Parse before creating a dump so a typo cannot create a new artifact and
  // then select an unsafe retention deletion set.
  const keep = parseBackupRetention(process.env.DB_BACKUP_KEEP);
  const sink = createBackupSinkFromEnv();
  const manifest = await createDatabaseBackup({ databaseUrl: process.env.DATABASE_URL, sink });
  const removed = await applyRetention(sink, keep);
  logger.info("Database backup committed", {
    artifactId: manifest.artifactId,
    provider: sink.kind,
    bytes: manifest.byteLength,
    removed: removed.length,
  });
  return { created: 1, removed: removed.length };
}

export async function runListBackups(): Promise<void> {
  const manifests = await createBackupSinkFromEnv().list();
  console.table(manifests.map(({ artifactId, createdAt, verifiedAt, byteLength, migrationTag }) => ({
    artifactId, createdAt, verifiedAt, byteLength, migrationTag,
  })));
}

export async function runVerifyBackup(id: string): Promise<boolean> {
  const sink = createBackupSinkFromEnv();
  const manifest = await sink.readManifest(id);
  const { verifyBackupArtifact } = await import("@/lib/database-backup/service");
  await verifyBackupArtifact(sink, manifest);
  return true;
}
