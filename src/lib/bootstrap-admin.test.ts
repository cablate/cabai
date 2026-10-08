import { describe, expect, it } from "vitest";
import { parseBootstrapAdminArgs } from "./bootstrap-admin";

describe("parseBootstrapAdminArgs", () => {
  it("normalizes email and requires explicit additional-admin opt-in", () => {
    expect(parseBootstrapAdminArgs([" Admin@Example.COM "])).toEqual({ email: "admin@example.com", allowAdditionalAdmin: false });
    expect(parseBootstrapAdminArgs(["admin@example.com", "--allow-additional-admin"]).allowAdditionalAdmin).toBe(true);
  });
  it("rejects invalid input", () => {
    expect(() => parseBootstrapAdminArgs([])).toThrow("valid email");
    expect(() => parseBootstrapAdminArgs(["not-an-email"])).toThrow("valid email");
    expect(() => parseBootstrapAdminArgs(["admin@example.com", "--force"])).toThrow("Unknown option");
  });
});
