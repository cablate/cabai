import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { isJobRunOverdue } from "./ledger";
import { summarizeJobResult } from "./registry";

describe("job ledger safe projections", () => {
  it("persists only allowlisted nonnegative integer counters", () => {
    expect(summarizeJobResult("webhook-outbox", {
      ok: true,
      workerId: "webhook-secret-worker",
      scanned: 3,
      claimed: 2,
      processed: 2,
      sent: 1,
      failed: 1,
      deadLetter: 0,
      skipped: 1,
      errors: 0,
      payload: { token: "must-not-persist" },
      negative: -1,
      fractional: 1.5,
    })).toEqual({
      scanned: 3,
      claimed: 2,
      processed: 2,
      sent: 1,
      failed: 1,
      deadLetter: 0,
      skipped: 1,
      errors: 0,
    });
  });

  it("uses per-job summary allowlists", () => {
    expect(summarizeJobResult("database-backup", { key: "private/storage/key" })).toEqual({});
    expect(summarizeJobResult("cleanup-orders", { expired: 4, deleted: 99 })).toEqual({ expired: 4 });
    expect(summarizeJobResult("media-cleanup", { orphaned: 2, deleted: 1, errors: 0 })).toEqual({
      orphaned: 2,
      deleted: 1,
      errors: 0,
    });
  });

  it("derives overdue without changing the persisted running state", () => {
    const run = { status: "running" as const, deadlineAt: new Date("2026-01-01T00:00:00Z") };
    expect(isJobRunOverdue(run, new Date("2026-01-01T00:00:01Z"))).toBe(true);
    expect(run.status).toBe("running");
    expect(isJobRunOverdue({ ...run, status: "succeeded" }, new Date("2026-01-01T00:00:01Z"))).toBe(false);
  });
});
