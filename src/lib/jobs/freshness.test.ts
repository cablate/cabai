import { describe, expect, it } from "vitest";
import { evaluateJobFreshness, jobFreshnessThresholdMs, type JobFreshnessRow } from "./freshness";

const now = new Date("2026-07-13T12:00:00.000Z");

function row(overrides: Partial<JobFreshnessRow> = {}): JobFreshnessRow {
  return {
    jobId: "webhook-outbox",
    latest: null,
    latestSuccess: null,
    ...overrides,
  };
}

describe("job freshness", () => {
  it("allows two backup intervals plus scheduler jitter", () => {
    expect(jobFreshnessThresholdMs["database-backup"]).toBe(75 * 60_000);
  });

  it("keeps a never-run job pending only inside its initial grace window", () => {
    expect(evaluateJobFreshness({
      rows: [row()],
      enabledJobIds: ["webhook-outbox"],
      now,
      graceStartedAt: new Date(now.getTime() - jobFreshnessThresholdMs["webhook-outbox"]),
    })[0]).toMatchObject({ state: "pending", code: "JOB_INITIAL_GRACE" });

    expect(evaluateJobFreshness({
      rows: [row()],
      enabledJobIds: ["webhook-outbox"],
      now,
      graceStartedAt: new Date(now.getTime() - jobFreshnessThresholdMs["webhook-outbox"] - 1),
    })[0]).toMatchObject({ state: "stale", code: "JOB_NEVER_SUCCEEDED" });
  });

  it("marks a recent success fresh and an old success stale at the exact boundary", () => {
    const threshold = jobFreshnessThresholdMs["webhook-outbox"];
    const atBoundary = new Date(now.getTime() - threshold);
    const stale = new Date(now.getTime() - threshold - 1);

    expect(evaluateJobFreshness({
      rows: [row({ latestSuccess: { status: "succeeded", startedAt: atBoundary, finishedAt: atBoundary } })],
      enabledJobIds: ["webhook-outbox"],
      now,
    })[0]).toMatchObject({ state: "fresh", code: "JOB_FRESH" });
    expect(evaluateJobFreshness({
      rows: [row({ latestSuccess: { status: "succeeded", startedAt: stale, finishedAt: stale } })],
      enabledJobIds: ["webhook-outbox"],
      now,
    })[0]).toMatchObject({ state: "stale", code: "JOB_SUCCESS_STALE" });
  });

  it("reports a newer failed run without exposing its stored error fields", () => {
    const success = new Date(now.getTime() - 60_000);
    const failed = new Date(now.getTime() - 30_000);
    const result = evaluateJobFreshness({
      rows: [row({
        latest: { status: "failed", startedAt: failed, finishedAt: failed },
        latestSuccess: { status: "succeeded", startedAt: success, finishedAt: success },
      })],
      enabledJobIds: ["webhook-outbox"],
      now,
    });

    expect(result[0]).toMatchObject({ state: "failed", code: "JOB_FAILED" });
    expect(JSON.stringify(result)).not.toContain("error");
  });

  it("does not evaluate disabled jobs", () => {
    expect(evaluateJobFreshness({ rows: [row()], enabledJobIds: [], now })).toEqual([]);
  });
});
