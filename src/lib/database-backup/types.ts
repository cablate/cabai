import type { Readable } from "node:stream";

export const BACKUP_MANIFEST_VERSION = "cabai-backup/v1" as const;

export interface BackupManifest {
  manifestVersion: typeof BACKUP_MANIFEST_VERSION;
  artifactId: string;
  format: "postgresql-plain-sql";
  compression: "gzip";
  byteLength: number;
  sha256: string;
  createdAt: string;
  verifiedAt: string;
  appVersion: string;
  appCommit?: string;
  migrationTag: string;
  sourcePostgresMajor: number;
  pgDumpMajor: number;
}

export interface BackupSink {
  readonly kind: "local" | "r2";
  stage(artifactId: string, source: Readable): Promise<void>;
  open(artifactId: string): Promise<Readable>;
  commit(manifest: BackupManifest): Promise<void>;
  readManifest(artifactId: string): Promise<BackupManifest>;
  list(): Promise<BackupManifest[]>;
  remove(artifactId: string): Promise<void>;
  abort(artifactId: string): Promise<void>;
}
