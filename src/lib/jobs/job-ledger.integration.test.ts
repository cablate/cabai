import crypto from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { requireTestDatabaseUrl } from "@/test/setup";
import {
  getLatestJobRun,
  interruptPreviousAndStartJobRun,
  recordFailedJobRun,
  recordSkippedJobRun,
  recordSucceededJobRun,
  type JobRunIdentity,
} from "./ledger";

const insertedIds = new Set<string>();

function identity(
  id: string,
  overrides: Partial<JobRunIdentity> = {},
): JobRunIdentity {
  insertedIds.add(id);
  return {
    id,
    jobId: "cleanup-orders",
    trigger: "system",
    runnerId: `test-job-ledger-${crypto.randomUUID()}`,
    appVersion: "integration-test",
    startedAt: new Date(),
    ...overrides,
  };
}

beforeAll(() => {
  requireTestDatabaseUrl();
});

afterEach(async () => {
  const ids = [...insertedIds];
  insertedIds.clear();
  if (ids.length > 0) await db.delete(jobRuns).where(inArray(jobRuns.id, ids));
});

describe("durable job ledger", () => {
  it("interrupts a crash row, persists the replacement, and protects its terminal result with CAS", async () => {
    const staleId = crypto.randomUUID();
    const currentId = crypto.randomUUID();
    const stale = identity(staleId, {
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      runnerId: "test-job-ledger-crashed-runner",
    });
    await db.insert(jobRuns).values({
      id: stale.id,
      jobKey: stale.jobId,
      trigger: stale.trigger,
      status: "running",
      startedAt: stale.startedAt,
      runnerId: stale.runnerId,
      appVersion: stale.appVersion,
    });

    await interruptPreviousAndStartJobRun(identity(currentId, {
      startedAt: new Date("2026-01-02T00:00:00.000Z"),
    }));

    const staleRow = await db.query.jobRuns.findFirst({ where: eq(jobRuns.id, staleId) });
    expect(staleRow).toEqual(expect.objectContaining({
      status: "interrupted",
      errorCode: "RUNNER_INTERRUPTED",
      finishedAt: expect.any(Date),
    }));

    await expect(recordSucceededJobRun(currentId, { expired: 2 })).resolves.toBe(true);
    await expect(recordFailedJobRun(currentId)).resolves.toBe(false);

    const latestAfterRestart = await getLatestJobRun("cleanup-orders");
    expect(latestAfterRestart).toEqual(expect.objectContaining({
      id: currentId,
      status: "succeeded",
      safeSummary: { expired: 2 },
    }));
  });

  it("stores only a generic failure fact and never receives the thrown secret", async () => {
    const id = crypto.randomUUID();
    const secretBearingError = new Error(
      "postgres://admin:super-secret@db.example/app?token=provider-secret",
    );
    await interruptPreviousAndStartJobRun(identity(id, { jobId: "media-cleanup" }));

    await expect(recordFailedJobRun(id)).resolves.toBe(true);
    const row = await db.query.jobRuns.findFirst({ where: eq(jobRuns.id, id) });
    expect(row).toEqual(expect.objectContaining({
      status: "failed",
      errorCode: "JOB_EXECUTION_FAILED",
      errorSummary: "Job execution failed; inspect protected logs with the run ID",
      safeSummary: {},
    }));
    expect(JSON.stringify(row)).not.toContain("super-secret");
    expect(JSON.stringify(row)).not.toContain(secretBearingError.message);
  });

  it("records lock contention as a terminal skipped attempt", async () => {
    const id = crypto.randomUUID();
    await recordSkippedJobRun(identity(id, {
      trigger: "external_cron",
      triggerId: crypto.randomUUID(),
    }));

    const [row] = await db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.id, id), eq(jobRuns.status, "skipped")));
    expect(row).toEqual(expect.objectContaining({
      trigger: "external_cron",
      finishedAt: expect.any(Date),
    }));
  });
});
