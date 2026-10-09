import { describe, expect, it, vi } from "vitest";
import { assertPostgresCompatibility, assertRestoreTarget, runRestoreDrill } from "./restore-drill";
import type { BackupSink } from "./types";

describe("restore drill target guard", () => {
  const targetUrl = "postgresql://user:secret@127.0.0.1:5432/cabai_restore_drill_ci";

  it("accepts an exact confirmed local disposable target", () => {
    expect(assertRestoreTarget({ targetUrl, confirmTarget: "cabai_restore_drill_ci" }).pathname).toBe("/cabai_restore_drill_ci");
  });

  it.each(["host=db.example.com", "port=6543", "user=other", "hostaddr=192.0.2.1", "service=other", "sslmode=require&host=db.example.com", "sslmode=require&sslmode=disable", "sslmode=unknown"])("rejects ambiguous or unsupported connection parameters: %s", (query) => {
    expect(() => assertRestoreTarget({ targetUrl: `${targetUrl}?${query}`, confirmTarget: "cabai_restore_drill_ci" })).toThrow();
  });

  it.each(["disable", "prefer", "require", "verify-ca", "verify-full"])("accepts a single supported sslmode: %s", (mode) => {
    expect(assertRestoreTarget({ targetUrl: `${targetUrl}?sslmode=${mode}`, confirmTarget: "cabai_restore_drill_ci" }).searchParams.get("sslmode")).toBe(mode);
  });

  it("rejects a routing override before reading any backup or connecting", async () => {
    const readManifest = vi.fn();
    await expect(runRestoreDrill({
      sink: { readManifest } as unknown as BackupSink,
      artifactId: "synthetic",
      targetUrl: `${targetUrl}?host=db.example.com`,
      confirmTarget: "cabai_restore_drill_ci",
      writesEnabled: true,
    })).rejects.toThrow("only supports the sslmode");
    expect(readManifest).not.toHaveBeenCalled();
  });

  it.each([
    ["confirmation mismatch", { targetUrl, confirmTarget: "other" }],
    ["production-like name", { targetUrl: targetUrl.replace("cabai_restore_drill_ci", "paid_service"), confirmTarget: "paid_service" }],
    ["source equals target", { targetUrl, confirmTarget: "cabai_restore_drill_ci", sourceUrl: targetUrl }],
    ["remote by default", { targetUrl: targetUrl.replace("127.0.0.1", "db.example.com"), confirmTarget: "cabai_restore_drill_ci" }],
  ])("rejects %s", (_label, input) => {
    expect(() => assertRestoreTarget(input)).toThrow();
  });
});

describe("restore PostgreSQL compatibility", () => {
  const manifest = { sourcePostgresMajor: 16, pgDumpMajor: 18 };
  it("requires a target at least as new as both source and pg_dump", () => {
    expect(() => assertPostgresCompatibility(18, manifest)).not.toThrow();
    expect(() => assertPostgresCompatibility(16, manifest)).toThrow("pg_dump client");
  });
});
