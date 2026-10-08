import { describe, expect, it } from "vitest";
import {
  normalizeTrackingPageSize,
  normalizeTrackingSearch,
  TRACKING_MAX_PAGE_SIZE,
  TRACKING_PAGE_SIZE,
} from "@/lib/services/tracking-query-service";

describe("tracking query input normalization", () => {
  it("normalizes and bounds search input", () => {
    expect(normalizeTrackingSearch("  two   words  ")).toBe("two words");
    expect(normalizeTrackingSearch("a".repeat(200))).toHaveLength(120);
    expect(normalizeTrackingSearch(undefined)).toBe("");
  });

  it("uses a default page size and enforces the hard maximum", () => {
    expect(normalizeTrackingPageSize(undefined)).toBe(TRACKING_PAGE_SIZE);
    expect(normalizeTrackingPageSize(0)).toBe(1);
    expect(normalizeTrackingPageSize(999)).toBe(TRACKING_MAX_PAGE_SIZE);
  });
});
