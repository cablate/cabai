import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/safe-callback-url";

describe("safeCallbackUrl", () => {
  it("preserves an internal path with onboarding query", () => {
    expect(safeCallbackUrl("/dashboard/profile?community=1")).toBe("/dashboard/profile?community=1");
  });

  it.each([
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
    "/dashboard\n/profile",
  ])("rejects unsafe callback %s", (value) => {
    expect(safeCallbackUrl(value)).toBe("/dashboard");
  });

  it("uses the first query value and falls back when absent", () => {
    expect(safeCallbackUrl(["/products", "//example.com"])).toBe("/products");
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
  });
});
