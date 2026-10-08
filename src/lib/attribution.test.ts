import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  captureAttribution,
  normalizeAttribution,
  readAttribution,
} from "@/lib/attribution";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("attribution", () => {
  it("keeps only allowed UTM fields and normalizes their values", () => {
    const params = new URLSearchParams({
      utm_source: " cab\u0000late ",
      utm_medium: "personal_site",
      utm_campaign: "x".repeat(120),
      email: "person@example.com",
      referrer: "https://example.com/private",
    });
    expect(normalizeAttribution(params)).toEqual({
      source: "cablate",
      medium: "personal_site",
      campaign: "x".repeat(100),
    });
  });

  it("stores last non-direct attribution for thirty minutes", () => {
    const storage = memoryStorage();
    captureAttribution(new URLSearchParams("utm_source=cablate"), storage, 1_000);
    expect(readAttribution(storage, 1_000 + ATTRIBUTION_TTL_MS - 1)).toEqual({ source: "cablate" });
    expect(readAttribution(storage, 1_000 + ATTRIBUTION_TTL_MS)).toEqual({});
    expect(storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("drops malformed stored data", () => {
    const storage = memoryStorage();
    storage.setItem(ATTRIBUTION_STORAGE_KEY, "not-json");
    expect(readAttribution(storage)).toEqual({});
  });
});
