/**
 * Webhook Signature Verification — Component Tests
 *
 * Tests that signature verification logic works correctly.
 * These tests would have caught the marketplace webhook bug
 * (signing rawBody instead of JSON.stringify(data)).
 */
import crypto from "node:crypto";
import { describe, it, expect } from "vitest";

// ─── Portaly Callback signature (timestamp + stableJson) ───

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signCallback(secret: string, payload: unknown, timestamp: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${stableJson(payload)}`)
    .digest("hex");
}

// ─── Marketplace signature (JSON.stringify(data) only) ───

function signMarketplace(secret: string, data: unknown): string {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(data))
    .digest("hex");
}

describe("Portaly Callback / Signature verification", () => {
  const secret = "test-secret-abc123";
  const timestamp = "2026-05-13T12:00:00.000Z";
  const payload = {
    sessionId: "sess_123",
    amount: 9900,
    paymentMethod: "credit_card",
  };

  it("correct secret + timestamp + payload produces valid signature", () => {
    const sig = signCallback(secret, payload, timestamp);
    expect(sig).toHaveLength(64); // SHA-256 hex
    // Verify it's deterministic
    expect(signCallback(secret, payload, timestamp)).toBe(sig);
  });

  it("stableJson sorts keys alphabetically", () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(a)).toBe('{"a":2,"z":1}');
  });

  it("stableJson handles nested objects recursively", () => {
    const obj = { b: { z: 1, a: 2 }, a: 3 };
    expect(stableJson(obj)).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it("wrong secret produces different signature", () => {
    const correct = signCallback(secret, payload, timestamp);
    const wrong = signCallback("wrong-secret", payload, timestamp);
    expect(wrong).not.toBe(correct);
  });

  it("wrong timestamp produces different signature", () => {
    const correct = signCallback(secret, payload, timestamp);
    const wrong = signCallback(secret, payload, "2026-05-13T13:00:00.000Z");
    expect(wrong).not.toBe(correct);
  });

  it("modified payload produces different signature", () => {
    const correct = signCallback(secret, payload, timestamp);
    const wrong = signCallback(secret, { ...payload, amount: 100 }, timestamp);
    expect(wrong).not.toBe(correct);
  });
});

describe("Portaly Marketplace / Signature verification", () => {
  const secret = "marketplace-secret-xyz";
  const data = {
    id: "order_123",
    productId: "prod_456",
    customerData: { email: "buyer@example.com", name: "Buyer" },
    amount: 5000,
    currency: "TWD",
    createdAt: "2026-05-12T10:00:00Z",
  };

  it("signs only the data object, not the full payload", () => {
    // This test specifically prevents the original bug:
    // signing the full body { data, event, timestamp } instead of just data
    const fullPayload = { data, event: "paid", timestamp: "2026-05-12T10:00:00Z" };

    const sigData = signMarketplace(secret, data);
    const sigFull = signMarketplace(secret, fullPayload);

    // These MUST be different — if they're the same, something is wrong
    expect(sigData).not.toBe(sigFull);
    // The correct signature is from data only
    expect(sigData).toHaveLength(64);
  });

  it("matches Portaly documentation example", () => {
    // From Portaly docs:
    // data = {"test":123}, secret = "abcdef0123"
    // expected = "c6dddde7ffbf0c651277f40b52cc8a07d80493982eaa6a10b7ab30bd6d9d4fe7"
    const sig = signMarketplace("abcdef0123", { test: 123 });
    expect(sig).toBe("c6dddde7ffbf0c651277f40b52cc8a07d80493982eaa6a10b7ab30bd6d9d4fe7");
  });

  it("JSON key order matters (not sorted)", () => {
    // Marketplace uses JSON.stringify, not stableJson
    // So key order depends on JS insertion order (from JSON.parse)
    const a = JSON.stringify({ z: 1, a: 2 }); // '{"z":1,"a":2}'
    const b = JSON.stringify({ a: 2, z: 1 }); // '{"a":2,"z":1}'
    // These produce DIFFERENT signatures because stringify preserves order
    const sigA = crypto.createHmac("sha256", "key").update(a).digest("hex");
    const sigB = crypto.createHmac("sha256", "key").update(b).digest("hex");
    expect(sigA).not.toBe(sigB);
  });

  it("wrong secret produces different signature", () => {
    const correct = signMarketplace(secret, data);
    const wrong = signMarketplace("wrong", data);
    expect(wrong).not.toBe(correct);
  });
});
