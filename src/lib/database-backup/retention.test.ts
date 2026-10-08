import { describe, expect, it, vi } from "vitest";
import { applyRetention } from "./service";
import { parseBackupRetention } from "./retention";
import type { BackupManifest, BackupSink } from "./types";

function manifest(index: number): BackupManifest {
  return {
    manifestVersion: "cabai-backup/v1",
    artifactId: `backup-${index}`,
    format: "postgresql-plain-sql",
    compression: "gzip",
    byteLength: 1,
    sha256: "a".repeat(64),
    createdAt: new Date(2026, 0, index + 1).toISOString(),
    verifiedAt: new Date(2026, 0, index + 1).toISOString(),
    appVersion: "test",
    migrationTag: "0012_test",
    sourcePostgresMajor: 17,
    pgDumpMajor: 17,
  };
}

function retentionSink(): BackupSink & { remove: ReturnType<typeof vi.fn> } {
  const remove = vi.fn().mockResolvedValue(undefined);
  return {
    kind: "local",
    stage: vi.fn(),
    commit: vi.fn(),
    abort: vi.fn(),
    list: vi.fn().mockResolvedValue(Array.from({ length: 5 }, (_, index) => manifest(index))),
    open: vi.fn(),
    readManifest: vi.fn(),
    remove,
  } as unknown as BackupSink & { remove: ReturnType<typeof vi.fn> };
}

describe("backup retention input", () => {
  it("uses the documented default when the value is absent", () => {
    expect(parseBackupRetention(undefined)).toBe(336);
    expect(parseBackupRetention("  ")).toBe(336);
  });

  it.each(["abc", "0", "-5", "2", "3.5", "1e3", "9007199254740992"])(
    "rejects unsafe configured value %s",
    (value) => {
      expect(() => parseBackupRetention(value)).toThrow(/DB_BACKUP_KEEP/);
    },
  );

  it("accepts a whole-number value at or above the safety floor", () => {
    expect(parseBackupRetention("3")).toBe(3);
    expect(parseBackupRetention("45")).toBe(45);
  });

  it.each([Number.NaN, -5, 0, 2, 3.5, Number.POSITIVE_INFINITY])(
    "does not remove artifacts when a direct caller supplies %s",
    async (keep) => {
      const sink = retentionSink();
      await expect(applyRetention(sink, keep)).rejects.toThrow(/retention/i);
      expect(sink.remove).not.toHaveBeenCalled();
    },
  );

  it("removes only generations after the validated keep count", async () => {
    const sink = retentionSink();
    await expect(applyRetention(sink, 3)).resolves.toEqual(["backup-3", "backup-4"]);
    expect(sink.remove).toHaveBeenCalledTimes(2);
  });
});
