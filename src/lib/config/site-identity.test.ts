import { describe, expect, it } from "vitest";
import { getSiteIdentity, inspectSiteIdentity } from "./site-identity";

describe("site identity configuration", () => {
  it("uses neutral defaults independent of the operator environment", () => {
    expect(inspectSiteIdentity({}).value).toMatchObject({
      brandName: "CabAI",
      brandInitial: "AI",
      contactEmail: "support@example.com",
      defaultLocale: "zh-TW",
    });
  });

  it("accepts a self-hosted identity and normalizes the asset origin", () => {
    const result = inspectSiteIdentity({
      NEXT_PUBLIC_SITE_NAME: "Learning Lab",
      NEXT_PUBLIC_SITE_INITIAL: "LL",
      SITE_LEGAL_NAME: "Learning Lab Limited",
      CONTACT_EMAIL: "hello@example.com",
      SITE_DEFAULT_LOCALE: "en-US",
      NEXT_PUBLIC_ASSET_HOST: "https://cdn.example.com/",
    });

    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      brandName: "Learning Lab",
      brandInitial: "LL",
      legalName: "Learning Lab Limited",
      contactEmail: "hello@example.com",
      defaultLocale: "en-US",
      assetOrigin: "https://cdn.example.com",
    });
  });

  it("reports invalid public identity values without echoing them", () => {
    const result = inspectSiteIdentity({
      CONTACT_EMAIL: "not-an-email",
      NEXT_PUBLIC_ASSET_HOST: "javascript:alert(1)",
    });

    expect(result.issues.map((issue) => issue.key)).toEqual(["CONTACT_EMAIL", "NEXT_PUBLIC_ASSET_HOST"]);
    expect(JSON.stringify(result.issues)).not.toContain("not-an-email");
    expect(() => getSiteIdentity({ CONTACT_EMAIL: "not-an-email" })).toThrow("CONTACT_EMAIL");
  });
});
