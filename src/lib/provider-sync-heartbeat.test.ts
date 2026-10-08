import { afterEach, describe, expect, it, vi } from "vitest";
import { withProviderSyncHeartbeat } from "@/lib/provider-sync-heartbeat";

describe("provider-sync heartbeat", () => {
  afterEach(() => vi.useRealTimers());

  it("renews a live execution lease periodically until the operation completes", async () => {
    vi.useFakeTimers();
    let leaseExpiresAt = Date.now() + 100;
    const heartbeat = vi.fn(async () => {
      leaseExpiresAt = Date.now() + 100;
      return true;
    });
    let finish!: (value: string) => void;
    const running = withProviderSyncHeartbeat({
      jobId: "job-1",
      leaseOwner: "worker-1",
      intervalMs: 30,
      heartbeat,
      run: () => new Promise<string>((resolve) => { finish = resolve; }),
    });

    await vi.advanceTimersByTimeAsync(110);

    expect(heartbeat).toHaveBeenCalledTimes(3);
    expect(Date.now()).toBeLessThan(leaseExpiresAt);
    finish("done");
    await expect(running).resolves.toEqual({ lostLease: false, value: "done" });
  });

  it("stops the worker from treating a lost heartbeat as an owned lease", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const running = withProviderSyncHeartbeat({
      jobId: "job-2",
      leaseOwner: "worker-2",
      intervalMs: 10,
      heartbeat: vi.fn(async () => false),
      run: () => new Promise<void>((resolve) => { finish = resolve; }),
    });

    await vi.advanceTimersByTimeAsync(10);
    finish();

    await expect(running).resolves.toMatchObject({ lostLease: true });
  });
});
