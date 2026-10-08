import { describe, expect, it } from "vitest";
import {
  buildPublicNavItems,
  publicNavItemIsActive,
} from "./public-navigation";

describe("public navigation", () => {
  it("omits empty Library and Skill destinations", () => {
    expect(buildPublicNavItems({ library: false, skills: false }).map((item) => item.href))
      .toEqual(["/", "/products", "/information", "/community"]);
  });

  it("adds each governed content destination independently", () => {
    expect(buildPublicNavItems({ library: true, skills: false }).map((item) => item.href))
      .toContain("/library");
    expect(buildPublicNavItems({ library: false, skills: true }).map((item) => item.href))
      .toContain("/skills");
  });

  it("keeps detail pages active without treating every route as home", () => {
    expect(publicNavItemIsActive("/library/an-entry", "/library")).toBe(true);
    expect(publicNavItemIsActive("/skills/example", "/skills")).toBe(true);
    expect(publicNavItemIsActive("/products", "/")).toBe(false);
  });
});
