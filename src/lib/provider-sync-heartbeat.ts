export const PROVIDER_SYNC_HEARTBEAT_INTERVAL_MS = 30_000;

type Heartbeat = (jobId: string, leaseOwner: string) => Promise<boolean>;

/** Keep a database lease alive while async provider-sync work is in progress. */
export async function withProviderSyncHeartbeat<T>(input: {
  jobId: string;
  leaseOwner: string;
  run: () => Promise<T>;
  heartbeat: Heartbeat;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}): Promise<{ lostLease: boolean; value?: T }> {
  const intervalMs = input.intervalMs ?? PROVIDER_SYNC_HEARTBEAT_INTERVAL_MS;
  let lostLease = false;
  let heartbeatInFlight: Promise<void> | null = null;
  const pulse = () => {
    if (heartbeatInFlight || lostLease) return;
    heartbeatInFlight = input.heartbeat(input.jobId, input.leaseOwner)
      .then((owned) => { if (!owned) lostLease = true; })
      .catch((error: unknown) => {
        lostLease = true;
        input.onError?.(error);
      })
      .finally(() => { heartbeatInFlight = null; });
  };
  const timer = setInterval(pulse, intervalMs);
  timer.unref?.();
  try {
    const value = await input.run();
    if (heartbeatInFlight) await heartbeatInFlight;
    return { lostLease, value };
  } finally {
    clearInterval(timer);
    if (heartbeatInFlight) await heartbeatInFlight;
  }
}
