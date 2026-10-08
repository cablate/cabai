import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_SECTIONS,
  isAdminNavItemActive,
} from "./admin-navigation";

describe("admin navigation", () => {
  it("groups daily routes by operational job and hides development catalogue", () => {
    expect(ADMIN_NAV_SECTIONS.map((section) => section.title)).toEqual([
      "內容製作",
      "商務與權限",
      "成效與分發",
      "系統維運",
    ]);

    const hrefs = ADMIN_NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.href),
    );

    expect(hrefs).toContain("/admin/plans");
    expect(hrefs).toContain("/admin/orders");
    expect(hrefs).not.toContain("/admin/ui");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("matches nested routes without matching sibling prefixes", () => {
    expect(isAdminNavItemActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavItemActive("/admin/orders", "/admin")).toBe(false);
    expect(isAdminNavItemActive("/admin/orders/123", "/admin/orders")).toBe(true);
    expect(isAdminNavItemActive("/admin/orders-archive", "/admin/orders")).toBe(false);
  });
});
