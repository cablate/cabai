import { describe, expect, it, vi } from "vitest";

const loggerError = vi.fn();

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerError,
  }),
}));

const { emitJobFailureAlert } = await import("./alerts");

describe("job alert seam", () => {
  it("sends only allowlisted operational fields", async () => {
    const sink = vi.fn();

    await emitJobFailureAlert({
      jobId: "cleanup-orders",
      trigger: "external_cron",
      triggerId: "cron.cleanup-orders",
    }, sink);

    expect(sink).toHaveBeenCalledWith({
      kind: "job_failure",
      jobId: "cleanup-orders",
      trigger: "external_cron",
      triggerId: "cron.cleanup-orders",
      errorCode: "JOB_EXECUTION_FAILED",
    });
  });

  it("falls back to the redacted logger when an optional provider fails", async () => {
    const sink = vi.fn().mockRejectedValue(new Error("provider token secret"));

    await expect(emitJobFailureAlert({
      jobId: "webhook-outbox",
      trigger: "in_process",
    }, sink)).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith("Job alert provider failed", {
      kind: "job_failure",
      jobId: "webhook-outbox",
      trigger: "in_process",
      errorCode: "JOB_EXECUTION_FAILED",
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("secret");
  });
});
