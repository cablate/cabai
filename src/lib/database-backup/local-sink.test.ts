import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { LocalBackupSink } from "./local-sink";
import type { BackupManifest } from "./types";

const roots: string[] = [];
const id = "cabai-20260713T010203Z-12345678";
const manifest: BackupManifest = {
  manifestVersion: "cabai-backup/v1", artifactId: id, format: "postgresql-plain-sql", compression: "gzip",
  byteLength: 3, sha256: "a".repeat(64), createdAt: "2026-07-13T01:02:03.000Z",
  verifiedAt: "2026-07-13T01:02:04.000Z", appVersion: "0.1.0", migrationTag: "0012_example",
  sourcePostgresMajor: 18, pgDumpMajor: 18,
};

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("LocalBackupSink", () => {
  it("stages privately and only lists committed valid manifests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cabai-backup-")); roots.push(root);
    const sink = new LocalBackupSink(root);
    await sink.stage(id, Readable.from(Buffer.from("abc")));
    await sink.commit(manifest);
    expect(await readFile(path.join(root, `${id}.sql.gz`), "utf8")).toBe("abc");
    if (process.platform !== "win32") {
      expect((await stat(path.join(root, `${id}.sql.gz`))).mode & 0o777).toBe(0o600);
    }
    expect(await sink.list()).toEqual([manifest]);
  });

  it("ignores corrupt manifests and rejects unsafe ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cabai-backup-")); roots.push(root);
    const sink = new LocalBackupSink(root);
    await writeFile(path.join(root, "bad.manifest.json"), "{}");
    expect(await sink.list()).toEqual([]);
    await expect(sink.open("../escape")).rejects.toThrow("Invalid backup artifact id");
  });
});
