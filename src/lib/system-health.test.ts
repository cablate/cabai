import { describe, expect, it, vi } from "vitest";
import { combineCountSignals, getSystemHealthSnapshot, type SystemHealthProbes } from "./system-health";

const observedAt = new Date("2026-09-27T00:00:00.000Z");

function probes(overrides: Partial<SystemHealthProbes> = {}): SystemHealthProbes {
  return {
    database: vi.fn().mockResolvedValue("healthy"),
    pendingWebhookLogs: vi.fn().mockResolvedValue(2),
    failedWebhookLogs: vi.fn().mockResolvedValue(1),
    pendingEntitlementTransitions: vi.fn().mockResolvedValue(3),
    failedEntitlementTransitions: vi.fn().mockResolvedValue(4),
    lastWebhookTime: vi.fn().mockResolvedValue(new Date("2026-09-26T23:00:00.000Z")),
    oldPendingOrders: vi.fn().mockResolvedValue(5),
    ...overrides,
  };
}

describe("getSystemHealthSnapshot", () => {
  it("reports every successfully observed signal without manufacturing fallback values", async () => {
    const result = await getSystemHealthSnapshot({ probes: probes(), now: () => observedAt, nodeEnv: "test", databaseConfigured: true });

    expect(result.status).toBe("ok");
    expect(result.signals.pendingWebhookLogs).toMatchObject({ status: "ok", value: 2 });
    expect(result.signals.failedEntitlementTransitions).toMatchObject({ status: "ok", value: 4 });
    expect(result.environment).toEqual({ nodeEnv: "test", databaseConfigured: true });
  });

  it("keeps successful values when one probe fails and marks only that signal unknown", async () => {
    const result = await getSystemHealthSnapshot({
      probes: probes({ failedWebhookLogs: vi.fn().mockRejectedValue(new Error("queue unavailable")) }),
      now: () => observedAt,
    });

    expect(result.status).toBe("degraded");
    expect(result.signals.failedWebhookLogs).toMatchObject({ status: "unknown", value: null, errorClass: "Error" });
    expect(result.signals.pendingWebhookLogs).toMatchObject({ status: "ok", value: 2 });
    expect(result.signals.oldPendingOrders).toMatchObject({ status: "ok", value: 5 });
  });

  it.each([
    "database",
    "pendingWebhookLogs",
    "failedWebhookLogs",
    "pendingEntitlementTransitions",
    "failedEntitlementTransitions",
    "lastWebhookTime",
    "oldPendingOrders",
  ] as const)("isolates a %s probe failure and never exposes its raw message", async (failedSignal) => {
    const injected = probes();
    injected[failedSignal] = vi.fn().mockRejectedValue(new TypeError("postgres://user:secret@db/app")) as never;
    const result = await getSystemHealthSnapshot({ probes: injected, now: () => observedAt });

    expect(result.status).toBe("degraded");
    expect(result.signals[failedSignal]).toMatchObject({ status: "unknown", value: null, errorClass: "TypeError" });
    expect(JSON.stringify(result)).not.toContain("secret");
    for (const [name, signal] of Object.entries(result.signals)) {
      if (name !== failedSignal) expect(signal.status).toBe("ok");
    }
  });

  it("does not present a partial aggregate as zero", async () => {
    const result = await getSystemHealthSnapshot({
      probes: probes({ pendingEntitlementTransitions: vi.fn().mockRejectedValue(new Error("outbox unavailable")) }),
      now: () => observedAt,
    });

    expect(combineCountSignals([result.signals.pendingWebhookLogs, result.signals.pendingEntitlementTransitions])).toMatchObject({
      status: "unknown",
      value: null,
    });
  });
});
