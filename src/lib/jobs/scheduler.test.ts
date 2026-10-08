import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  runJob: vi.fn(),
  emitAlert: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
vi.mock("./runner", () => ({ runJob: mocks.runJob }));
vi.mock("./alerts", () => ({ emitJobFailureAlert: mocks.emitAlert }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: mocks.loggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.runJob.mockResolvedValue({ executed: true });
  mocks.emitAlert.mockResolvedValue(undefined);
});

describe("scheduler mode", () => {
  it("resolves explicit modes before the legacy compatibility flag", async () => {
    const { resolveSchedulerMode } = await import("./scheduler");

    expect(resolveSchedulerMode({ SCHEDULER_MODE: "external", SCHEDULED_TASKS_ENABLED: "true" })).toBe("external");
    expect(resolveSchedulerMode({ SCHEDULER_MODE: "disabled", SCHEDULED_TASKS_ENABLED: "true" })).toBe("disabled");
    expect(resolveSchedulerMode({ SCHEDULER_MODE: "in_process" })).toBe("in_process");
  });

  it("supports the old boolean flag and otherwise fails closed", async () => {
    const { resolveSchedulerMode } = await import("./scheduler");

    expect(resolveSchedulerMode({ SCHEDULED_TASKS_ENABLED: " TRUE " })).toBe("in_process");
    expect(resolveSchedulerMode({})).toBe("disabled");
    expect(() => resolveSchedulerMode({ SCHEDULER_MODE: "queue" })).toThrow(/SCHEDULER_MODE/);
  });

  it.each(["disabled", "external"] as const)("does not register cron in %s mode", async (mode) => {
    const { scheduleRegisteredJobs } = await import("./scheduler");

    scheduleRegisteredJobs({ mode });

    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith("In-process jobs are not registered", {
      schedulerMode: mode,
    });
  });

  it("registers once and records in-process trigger context", async () => {
    const callbacks: Array<() => void> = [];
    mocks.schedule.mockImplementation((_expression, callback) => callbacks.push(callback));
    const { scheduleRegisteredJobs } = await import("./scheduler");

    scheduleRegisteredJobs({ mode: "in_process" });
    scheduleRegisteredJobs({ mode: "in_process" });
    expect(mocks.schedule).toHaveBeenCalledTimes(6);
    expect(mocks.schedule).toHaveBeenCalledWith("*/30 * * * *", expect.any(Function));
    expect(mocks.schedule).toHaveBeenCalledWith("* * * * *", expect.any(Function));

    callbacks[1]!();
    await vi.waitFor(() => expect(mocks.runJob).toHaveBeenCalledWith(
      "cleanup-orders",
      undefined,
      { trigger: "in_process", triggerId: "schedule.cleanup-orders", alertSink: undefined },
    ));
  });

  it("does not register a degraded or disabled backup job", async () => {
    const { scheduleRegisteredJobs } = await import("./scheduler");

    scheduleRegisteredJobs({ mode: "in_process", disabledJobIds: ["database-backup"] });

    expect(mocks.schedule).toHaveBeenCalledTimes(5);
    expect(mocks.loggerInfo).toHaveBeenCalledWith("Registered in-process jobs", expect.objectContaining({
      disabledJobs: ["database-backup"],
      jobs: expect.not.arrayContaining([expect.objectContaining({ id: "database-backup" })]),
    }));
  });

  it("sends a redacted alert through the configured seam when a job fails", async () => {
    const callbacks: Array<() => void> = [];
    const alertSink = vi.fn();
    mocks.schedule.mockImplementation((_expression, callback) => callbacks.push(callback));
    mocks.runJob.mockRejectedValue(new Error("postgres://user:secret@db/app?token=secret"));
    const { scheduleRegisteredJobs } = await import("./scheduler");

    scheduleRegisteredJobs({ mode: "in_process", alertSink });
    callbacks[0]!();

    await vi.waitFor(() => expect(mocks.runJob).toHaveBeenCalledWith(
      "database-backup",
      undefined,
      {
        trigger: "in_process",
        triggerId: "schedule.database-backup",
        alertSink,
      },
    ));
    expect(JSON.stringify(mocks.runJob.mock.calls)).not.toContain("secret");
  });
});
