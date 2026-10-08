import { describe, expect, it } from "vitest";
import {
  getBillingLabel,
  getPersistentAccessLabel,
  getPreviewContinuationCopy,
  getTrustSectionTitle,
} from "@/lib/public-offering-copy";

describe("public offering copy", () => {
  it("keeps every free-claim label free of payment language", () => {
    const copy = [
      getBillingLabel("one-time", true),
      getPersistentAccessLabel(true),
      getTrustSectionTitle(true),
      ...Object.values(getPreviewContinuationCopy("站台驗收範例課程", true)),
    ].join(" ");

    expect(copy).toContain("免費");
    expect(copy).not.toMatch(/購買|付款|解鎖|保障/);
  });

  it("preserves paid billing and trust language", () => {
    expect(getBillingLabel("one-time", false)).toBe("單次購買");
    expect(getBillingLabel("monthly", false)).toBe("月訂閱");
    expect(getPersistentAccessLabel(false)).toBe("購買後於會員中心查看");
    expect(getTrustSectionTitle(false)).toBe("購買保障");
  });
});
