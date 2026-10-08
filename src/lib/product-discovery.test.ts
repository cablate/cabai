import { describe, expect, it } from "vitest";
import {
  resolveProductAcquisitionState,
  shouldShowOfferingTypeFilters,
} from "./product-discovery";

describe("resolveProductAcquisitionState", () => {
  it("keeps owned content accessible even when the plan is inactive", () => {
    expect(
      resolveProductAcquisitionState({
        alreadyPurchased: true,
        status: "inactive",
        amount: 3_000,
      }),
    ).toBe("owned");
  });

  it("marks inactive unowned content unavailable", () => {
    expect(
      resolveProductAcquisitionState({
        alreadyPurchased: false,
        status: "inactive",
        amount: 0,
      }),
    ).toBe("unavailable");
  });

  it("distinguishes active free and paid content", () => {
    expect(
      resolveProductAcquisitionState({
        alreadyPurchased: false,
        status: "active",
        amount: 0,
      }),
    ).toBe("free");
    expect(
      resolveProductAcquisitionState({
        alreadyPurchased: false,
        status: "active",
        amount: 1,
      }),
    ).toBe("paid");
  });
});

describe("shouldShowOfferingTypeFilters", () => {
  it("hides filters for empty and single-type catalogues", () => {
    expect(shouldShowOfferingTypeFilters([])).toBe(false);
    expect(shouldShowOfferingTypeFilters(["course", "course"])).toBe(false);
  });

  it("shows filters only when at least two types can be selected", () => {
    expect(shouldShowOfferingTypeFilters(["course", "download"])).toBe(true);
  });
});
