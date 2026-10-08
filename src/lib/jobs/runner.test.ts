import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupOrders: vi.fn(),
  withCronLock: vi.fn(),
  loggerError: vi.fn(),
  startRun: vi.fn(),
  recordSkipped: vi.fn(),
  recordSucceeded: vi.fn(),
  recordFailed: vi.fn(),
  emitAlert: vi.fn(),
}));

vi.mock("@/lib/cron-lock", () => ({
  withCronLock: mocks.withCronLock,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  }),
}));

vi.mock("./ledger", () => ({
  interruptPreviousAndStartJobRun: mocks.startRun,
  recordSkippedJobRun: mocks.recordSkipped,
  recordSucceededJobRun: mocks.recordSucceeded,
  recordFailedJobRun: mocks.recordFailed,
}));

vi.mock("./registry", () => ({
  jobIds: ["cleanup-orders"],
  jobs: {
    "cleanup-orders": mocks.cleanupOrders,
  },
  summarizeJobResult: (_jobId: string, result: unknown) => result,
}));

vi.mock("./alerts", () => ({
  emitJobFailureAlert: mocks.emitAlert,
}));

async function loadRunner() {
  return import("./runner");
}

beforeEach(() => {
  vi.resetModules();
  mocks.cleanupOrders.mockReset();
  mocks.withCronLock.mockReset();
  mocks.loggerError.mockReset();
  mocks.startRun.mockReset().mockResolvedValue(undefined);
  mocks.recordSkipped.mockReset().mockResolvedValue(undefined);
  mocks.recordSucceeded.mockReset().mockResolvedValue(true);
  mocks.recordFailed.mockReset().mockResolvedValue(true);
  mocks.emitAlert.mockReset().mockResolvedValue(undefined);
});

describe("job runner current behavior", () => {
  it("executes the registered job once when the advisory lock is acquired", async () => {
    const result = { expired: 2 };
    mocks.cleanupOrders.mockResolvedValue(result);
    mocks.withCronLock.mockImplementation(async (_name, task) => ({
      locked: true,
      result: await task(),
    }));
    const { getJobStatuses, runJob } = await loadRunner();

    await expect(runJob("cleanup-orders")).resolves.toEqual({
      executed: true,
      result,
    });
    expect(mocks.withCronLock).toHaveBeenCalledWith(
      "cron:cleanup-orders",
      expect.any(Function),
    );
    expect(mocks.cleanupOrders).toHaveBeenCalledTimes(1);
    expect(mocks.startRun).toHaveBeenCalledTimes(1);
    expect(mocks.recordSucceeded).toHaveBeenCalledWith(expect.any(String), result);
    expect(getJobStatuses()).toEqual([
      expect.objectContaining({
        jobId: "cleanup-orders",
        state: "succeeded",
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
      }),
    ]);
  });

  it("does not invoke the job when another runner holds the lock", async () => {
    mocks.withCronLock.mockResolvedValue({ locked: false });
    const { getJobStatuses, runJob } = await loadRunner();

    await expect(runJob("cleanup-orders")).resolves.toEqual({ executed: false });
    expect(mocks.cleanupOrders).not.toHaveBeenCalled();
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.recordSkipped).toHaveBeenCalledTimes(1);
    expect(getJobStatuses()).toEqual([
      expect.objectContaining({
        jobId: "cleanup-orders",
        state: "skipped",
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
      }),
    ]);
  });

  it("records failure and rethrows the identical job error", async () => {
    const failure = new Error("postgres://admin:super-secret@db.example/app?token=provider-secret");
    mocks.cleanupOrders.mockRejectedValue(failure);
    mocks.withCronLock.mockImplementation(async (_name, task) => ({
      locked: true,
      result: await task(),
    }));
    const { getJobStatuses, runJob } = await loadRunner();

    await expect(runJob("cleanup-orders")).rejects.toBe(failure);
    expect(mocks.cleanupOrders).toHaveBeenCalledTimes(1);
    expect(mocks.recordFailed).toHaveBeenCalledWith(expect.any(String));
    expect(mocks.recordFailed.mock.calls[0]).toHaveLength(1);
    expect(mocks.loggerError).toHaveBeenCalledWith("Job failed", {
      jobId: "cleanup-orders",
      error: "postgres://[redacted]@db.example/app?token=[redacted]",
    });
    expect(mocks.emitAlert).toHaveBeenCalledWith({
      jobId: "cleanup-orders",
      trigger: "system",
      triggerId: undefined,
    }, undefined);
    expect(getJobStatuses()).toEqual([
      expect.objectContaining({
        jobId: "cleanup-orders",
        state: "failed",
        error: "postgres://[redacted]@db.example/app?token=[redacted]",
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
      }),
    ]);
  });

  it("returns defensive copies of process-local statuses", async () => {
    mocks.cleanupOrders.mockResolvedValue({ expired: 0 });
    mocks.withCronLock.mockImplementation(async (_name, task) => ({
      locked: true,
      result: await task(),
    }));
    const { getJobStatuses, runJob } = await loadRunner();
    await runJob("cleanup-orders");

    const firstRead = getJobStatuses();
    firstRead[0]!.state = "failed";
    firstRead[0]!.error = "mutated by caller";

    expect(getJobStatuses()).toEqual([
      expect.objectContaining({
        jobId: "cleanup-orders",
        state: "succeeded",
      }),
    ]);
    expect(getJobStatuses()[0]).not.toHaveProperty("error");
  });

  it("fails closed when the pre-run ledger write fails", async () => {
    const ledgerFailure = new Error("ledger unavailable");
    mocks.startRun.mockRejectedValue(ledgerFailure);
    mocks.withCronLock.mockImplementation(async (_name, task) => ({
      locked: true,
      result: await task(),
    }));
    const { runJob } = await loadRunner();

    await expect(runJob("cleanup-orders")).rejects.toBe(ledgerFailure);
    expect(mocks.cleanupOrders).not.toHaveBeenCalled();
    expect(mocks.recordFailed).not.toHaveBeenCalled();
  });

  it("does not turn a successful job into a retry signal when terminal persistence fails", async () => {
    const result = { expired: 1 };
    mocks.cleanupOrders.mockResolvedValue(result);
    mocks.recordSucceeded.mockRejectedValue(new Error("terminal write failed"));
    mocks.withCronLock.mockImplementation(async (_name, task) => ({
      locked: true,
      result: await task(),
    }));
    const { runJob } = await loadRunner();

    await expect(runJob("cleanup-orders")).resolves.toEqual({ executed: true, result });
    expect(mocks.cleanupOrders).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Failed to persist successful job status",
      expect.objectContaining({ jobId: "cleanup-orders", runId: expect.any(String) }),
    );
  });
});
