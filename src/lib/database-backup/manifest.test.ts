import { describe, expect, it } from "vitest";
import { createArtifactId, parseBackupManifest } from "./manifest";

describe("backup manifest", () => {
  it("creates safe deterministic artifact ids", () => {
    expect(createArtifactId(new Date("2026-07-13T01:02:03Z"), "12345678-aaaa-bbbb-cccc-dddddddddddd"))
      .toBe("cabai-20260713T010203Z-12345678");
  });

  it("rejects unknown manifest versions and unsafe ids", () => {
    const base = {
      manifestVersion: "cabai-backup/v1", artifactId: "cabai-20260713T010203Z-12345678",
      format: "postgresql-plain-sql", compression: "gzip", byteLength: 10,
      sha256: "a".repeat(64), createdAt: "2026-07-13T01:02:03.000Z", verifiedAt: "2026-07-13T01:02:04.000Z",
      appVersion: "0.1.0", migrationTag: "0012_example", sourcePostgresMajor: 18, pgDumpMajor: 18,
    };
    expect(() => parseBackupManifest(base)).not.toThrow();
    expect(() => parseBackupManifest({ ...base, manifestVersion: "v2" })).toThrow();
    expect(() => parseBackupManifest({ ...base, artifactId: "../escape" })).toThrow();
  });
});
