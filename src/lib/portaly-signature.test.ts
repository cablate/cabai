import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stableJson } from "@/lib/stable-json";
vi.mock("@/lib/config/portaly", () => ({ resolvePortalyConfig: () => ({ state: "enabled", callbackSecret: "synthetic-callback-test-secret" }) }));
import { verifyCallback } from "@/lib/portaly-signature";
const timestamp = "2026-10-08T00:00:00.000Z";
const payload = { event: "checkout.completed", metadata: { cart_id: "test-cart" }, amount: 100 };
const sign = (data: unknown, ts = timestamp) => crypto.createHmac("sha256", "synthetic-callback-test-secret").update(`${ts}.${stableJson(data)}`).digest("hex");
describe("production callback verifier", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(timestamp)); });
  afterEach(() => vi.useRealTimers());
  it("accepts a valid signature and reordered object keys", () => {
    expect(verifyCallback(payload, timestamp, sign(payload))).toBe(true);
    expect(verifyCallback({ amount: 100, metadata: payload.metadata, event: payload.event }, timestamp, sign(payload))).toBe(true);
  });
  it("rejects a mutated signed event", () => expect(verifyCallback({ ...payload, event: "checkout.refunded" }, timestamp, sign(payload))).toBe(false));
  it.each(["", "a", "0".repeat(64), "é".repeat(64)])("rejects invalid signature %s", signature => expect(verifyCallback(payload, timestamp, signature)).toBe(false));
  it.each([-300001, 300001])("rejects stale or future signatures at offset %i", offset => {
    const ts = new Date(Date.parse(timestamp) + offset).toISOString();
    expect(verifyCallback(payload, ts, sign(payload, ts))).toBe(false);
  });
  it("rejects an invalid timestamp", () => expect(verifyCallback(payload, "invalid", sign(payload, "invalid"))).toBe(false));
});
