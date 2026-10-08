import { createHash, randomUUID } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import { z } from "zod";
import { BACKUP_MANIFEST_VERSION, type BackupManifest } from "./types";

const ARTIFACT_PATTERN = /^cabai-\d{8}T\d{6}Z-[0-9a-f]{8}$/;

export const backupManifestSchema = z.object({
  manifestVersion: z.literal(BACKUP_MANIFEST_VERSION),
  artifactId: z.string().regex(ARTIFACT_PATTERN),
  format: z.literal("postgresql-plain-sql"),
  compression: z.literal("gzip"),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string().datetime(),
  verifiedAt: z.string().datetime(),
  appVersion: z.string().min(1).max(100),
  appCommit: z.string().min(7).max(64).optional(),
  migrationTag: z.string().min(1).max(160),
  sourcePostgresMajor: z.number().int().positive(),
  pgDumpMajor: z.number().int().positive(),
}).strict();

export function assertArtifactId(value: string): string {
  if (!ARTIFACT_PATTERN.test(value)) throw new Error("Invalid backup artifact id.");
  return value;
}

export function createArtifactId(now = new Date(), uuid = randomUUID()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `cabai-${stamp}-${uuid.replaceAll("-", "").slice(0, 8)}`;
}

export function parseBackupManifest(input: unknown): BackupManifest {
  return backupManifestSchema.parse(input);
}

export class HashAndCountTransform extends Transform {
  private readonly hash = createHash("sha256");
  private length = 0;

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    this.length += chunk.length;
    callback(null, chunk);
  }

  result(): { sha256: string; byteLength: number } {
    return { sha256: this.hash.digest("hex"), byteLength: this.length };
  }
}
