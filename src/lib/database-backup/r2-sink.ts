import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { assertArtifactId, parseBackupManifest } from "./manifest";
import type { BackupManifest, BackupSink } from "./types";

export interface R2BackupSinkConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix?: string;
}

function safePrefix(value = "db-backups/"): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || /[\u0000-\u001f]/.test(trimmed)) {
    throw new Error("Invalid backup prefix.");
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export class R2BackupSink implements BackupSink {
  readonly kind = "r2" as const;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(private readonly config: R2BackupSinkConfig, client?: S3Client) {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      throw new Error("R2 backup credentials and a private backup bucket are required.");
    }
    this.prefix = safePrefix(config.prefix);
    this.client = client ?? new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private key(id: string, suffix: ".sql.gz" | ".manifest.json"): string {
    return `${this.prefix}${assertArtifactId(id)}${suffix}`;
  }

  async stage(id: string, source: Readable): Promise<void> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cabai-r2-backup-"));
    const staged = path.join(directory, `${assertArtifactId(id)}.sql.gz`);
    try {
      await pipeline(source, createWriteStream(staged, { flags: "wx", mode: 0o600 }));
      const file = await stat(staged);
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(id, ".sql.gz"),
        Body: createReadStream(staged),
        ContentLength: file.size,
        ContentType: "application/gzip",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async open(id: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(id, ".sql.gz") }));
    if (!result.Body) throw new Error("Backup artifact body is empty.");
    return result.Body as Readable;
  }

  async commit(manifest: BackupManifest): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(manifest.artifactId, ".manifest.json"),
      Body: `${JSON.stringify(manifest, null, 2)}\n`,
      ContentType: "application/json",
    }));
  }

  async readManifest(id: string): Promise<BackupManifest> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(id, ".manifest.json") }));
    if (!result.Body) throw new Error("Backup manifest body is empty.");
    return parseBackupManifest(JSON.parse(await result.Body.transformToString()));
  }

  async list(): Promise<BackupManifest[]> {
    const ids: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: this.prefix,
        ContinuationToken: token,
      }));
      for (const object of page.Contents ?? []) {
        if (!object.Key?.endsWith(".manifest.json")) continue;
        ids.push(object.Key.slice(this.prefix.length, -".manifest.json".length));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    const manifests: BackupManifest[] = [];
    for (const id of ids) {
      try { manifests.push(await this.readManifest(id)); } catch { /* never treat invalid metadata as committed */ }
    }
    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(id: string): Promise<void> {
    await this.client.send(new DeleteObjectsCommand({
      Bucket: this.config.bucket,
      Delete: { Objects: [{ Key: this.key(id, ".manifest.json") }, { Key: this.key(id, ".sql.gz") }] },
    }));
  }

  async abort(id: string): Promise<void> {
    await this.remove(id);
  }
}
