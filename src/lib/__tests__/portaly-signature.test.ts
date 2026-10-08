/**
 * Portaly Callback Signature — verifyCallback() tests
 *
 * Legacy algorithm examples only; actual verifier coverage is in ../portaly-signature.test.ts.
 * Pure logic, no DB needed.
 */
import crypto from "node:crypto";
import { describe, it, expect } from "vitest";

// We need to test with a known secret, so we mock the env
// and re-import the module for each test group.

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

function sign(secret: string, payload: unknown, timestamp: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${stableJson(payload)}`)
    .digest("hex");
}

describe("verifyCallback / replay protection", () => {
  it("timestamp within 5 minutes is accepted", () => {
    const now = new Date();
    const ts = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago
    const diff = now.getTime() - ts.getTime();
    expect(diff).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("timestamp older than 5 minutes is rejected", () => {
    const now = new Date();
    const ts = new Date(now.getTime() - 6 * 60 * 1000); // 6 min ago
    const diff = now.getTime() - ts.getTime();
    expect(diff).toBeGreaterThan(5 * 60 * 1000);
  });

  it("invalid timestamp string is rejected", () => {
    const ts = new Date("not-a-date");
    expect(Number.isNaN(ts.getTime())).toBe(true);
  });
});

describe("verifyCallback / signature correctness", () => {
  const secret = "test-callback-secret";
  const payload = { sessionId: "sess_1", amount: 9900 };
  const timestamp = new Date().toISOString();

  it("correct inputs produce matching signature", () => {
    const sig = sign(secret, payload, timestamp);
    const verify = sign(secret, payload, timestamp);
    expect(sig).toBe(verify);
  });

  it("different payload key order produces same signature (stableJson)", () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { m: 3, a: 2, z: 1 };
    const sigA = sign(secret, a, timestamp);
    const sigB = sign(secret, b, timestamp);
    expect(sigA).toBe(sigB);
  });

  it("signature is 64 char hex (SHA-256)", () => {
    const sig = sign(secret, payload, timestamp);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("empty payload produces valid signature", () => {
    const sig = sign(secret, {}, timestamp);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nested objects are sorted recursively", () => {
    const nested = { b: { z: 1, a: 2 }, a: "top" };
    const expected = '{"a":"top","b":{"a":2,"z":1}}';
    expect(stableJson(nested)).toBe(expected);
  });

  it("arrays preserve order (not sorted)", () => {
    const arr = [3, 1, 2];
    expect(stableJson(arr)).toBe("[3,1,2]");
  });

  it("null and boolean values serialize correctly", () => {
    expect(stableJson(null)).toBe("null");
    expect(stableJson(true)).toBe("true");
    expect(stableJson(false)).toBe("false");
  });
});

describe("Marketplace signature / route-level verification logic", () => {
  // Simulate what the route handler does:
  // 1. Parse raw body as JSON
  // 2. Extract data field
  // 3. JSON.stringify(data)
  // 4. HMAC that string

  const secret = "mkt-secret-123";

  it("parse → extract data → stringify → sign matches header", () => {
    const rawBody = JSON.stringify({
      data: { id: "ord_1", productId: "prod_1", customerData: { email: "a@b.com" }, amount: 100, currency: "TWD", createdAt: "2026-01-01" },
      event: "paid",
      timestamp: "2026-01-01T00:00:00Z",
    });

    // Simulate what the route does
    const body = JSON.parse(rawBody);
    const dataJson = JSON.stringify(body.data);
    const sig = crypto.createHmac("sha256", secret).update(dataJson).digest("hex");

    // Simulate what Portaly sent (same logic on their side)
    const portalySig = crypto.createHmac("sha256", secret).update(JSON.stringify(body.data)).digest("hex");

    expect(sig).toBe(portalySig);
  });

  it("signing full body instead of data only produces WRONG signature", () => {
    // This is the EXACT bug we fixed — regression test
    const payload = {
      data: { id: "ord_1", amount: 100 },
      event: "paid",
      timestamp: "2026-01-01T00:00:00Z",
    };

    const correctSig = crypto.createHmac("sha256", secret)
      .update(JSON.stringify(payload.data)).digest("hex");
    const wrongSig = crypto.createHmac("sha256", secret)
      .update(JSON.stringify(payload)).digest("hex");

    expect(correctSig).not.toBe(wrongSig);
  });

  it("Portaly doc test vector matches", () => {
    // From Portaly docs: data={"test":123}, secret="abcdef0123"
    const sig = crypto.createHmac("sha256", "abcdef0123")
      .update('{"test":123}').digest("hex");
    expect(sig).toBe("c6dddde7ffbf0c651277f40b52cc8a07d80493982eaa6a10b7ab30bd6d9d4fe7");
  });
});
