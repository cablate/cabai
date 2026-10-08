import { describe, expect, it } from "vitest";
import {
  readProviderSyncSnapshot,
  serializeProviderSyncSnapshot,
} from "@/lib/provider-sync-ledger";

describe("provider-sync durable snapshot boundary", () => {
  it("round-trips plain JSON provider data through a versioned operation envelope", () => {
    const providerPayload = {
      orders: [{ id: "order-1", email: "customer@example.test", paidAt: "2026-09-27T00:00:00.000Z" }],
      subscriptions: [],
      externalCalls: 2,
    };

    const serialized = serializeProviderSyncSnapshot("orders", providerPayload);

    expect(serialized).toEqual({ version: 1, operation: "orders", payload: providerPayload });
    expect(readProviderSyncSnapshot("orders", serialized)).toEqual(providerPayload);
    expect(() => readProviderSyncSnapshot("subscriptions", serialized)).toThrowError(expect.objectContaining({
      code: "PROVIDER_SNAPSHOT_UNSAFE",
    }));
  });

  it.each([
    ["Date instances", () => ({ readAt: new Date() })],
    ["non-finite numbers", () => ({ amount: Number.NaN })],
    ["functions", () => ({ next: () => undefined })],
    ["cyclic objects", () => {
      const value: Record<string, unknown> = {};
      value.self = value;
      return value;
    }],
    ["sparse arrays", () => {
      const value = new Array(2);
      value[1] = "present";
      return value;
    }],
  ])("rejects %s before any durable snapshot can be written", (_name, makeValue) => {
    expect(() => serializeProviderSyncSnapshot("plans", makeValue())).toThrowError(expect.objectContaining({
      code: "PROVIDER_SNAPSHOT_UNSAFE",
      status: 502,
    }));
  });
});
