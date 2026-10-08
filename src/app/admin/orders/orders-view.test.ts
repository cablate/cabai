import { describe, expect, it } from "vitest";
import { parseOrdersView } from "./orders-view";

describe("parseOrdersView", () => {
  it("defaults missing and unsupported values to local orders", () => {
    expect(parseOrdersView(undefined)).toBe("local");
    expect(parseOrdersView("unknown")).toBe("local");
  });

  it("accepts provider as an explicit reconciliation view", () => {
    expect(parseOrdersView("provider")).toBe("provider");
    expect(parseOrdersView(["provider", "local"])).toBe("provider");
  });
});
