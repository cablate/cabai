import { describe, expect, it } from "vitest";
import { assertPostgresCompatibility, assertRestoreTarget } from "./restore-drill";

describe("restore drill target guard", () => {
  const targetUrl = "postgresql://user:secret@127.0.0.1:5432/cabai_restore_drill_ci";

  it("accepts an exact confirmed local disposable target", () => {
    expect(assertRestoreTarget({ targetUrl, confirmTarget: "cabai_restore_drill_ci" }).pathname).toBe("/cabai_restore_drill_ci");
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
