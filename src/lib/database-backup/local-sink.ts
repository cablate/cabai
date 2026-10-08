import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { assertArtifactId, parseBackupManifest } from "./manifest";
import type { BackupManifest, BackupSink } from "./types";

export class LocalBackupSink implements BackupSink {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(id: string, suffix: ".sql.gz" | ".sql.gz.partial" | ".manifest.json"): string {
    assertArtifactId(id);
    const target = path.resolve(this.root, `${id}${suffix}`);
    if (path.dirname(target) !== this.root) throw new Error("Backup path escapes configured root.");
    return target;
  }

  async stage(id: string, source: NodeJS.ReadableStream): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const partial = this.file(id, ".sql.gz.partial");
    await pipeline(source, createWriteStream(partial, { flags: "wx", mode: 0o600 }));
    await rename(partial, this.file(id, ".sql.gz"));
    await chmod(this.file(id, ".sql.gz"), 0o600);
  }

  async open(id: string) {
    return createReadStream(this.file(id, ".sql.gz"));
  }

  async commit(manifest: BackupManifest): Promise<void> {
    const target = this.file(manifest.artifactId, ".manifest.json");
    await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }

  async readManifest(id: string): Promise<BackupManifest> {
    return parseBackupManifest(JSON.parse(await readFile(this.file(id, ".manifest.json"), "utf8")));
  }

  async list(): Promise<BackupManifest[]> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(this.root);
    const manifests: BackupManifest[] = [];
    for (const name of names.filter((value) => value.endsWith(".manifest.json")).sort()) {
      const id = name.slice(0, -".manifest.json".length);
      try { manifests.push(await this.readManifest(id)); } catch { /* invalid entries are never retention candidates */ }
    }
    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(id: string): Promise<void> {
    await rm(this.file(id, ".manifest.json"), { force: true });
    await rm(this.file(id, ".sql.gz"), { force: true });
  }

  async abort(id: string): Promise<void> {
    await rm(this.file(id, ".sql.gz.partial"), { force: true });
    await rm(this.file(id, ".sql.gz"), { force: true });
    await rm(this.file(id, ".manifest.json"), { force: true });
  }
}
