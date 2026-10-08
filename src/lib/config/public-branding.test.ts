import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readPublicBranding } from "./public-branding";

describe("shared public branding", () => {
  it("boots with neutral assets that exist", () => {
    const config = readPublicBranding({});
    for (const asset of [config.logo, config.socialImage, config.illustration]) {
      expect(existsSync(`public${asset}`)).toBe(true);
    }
  });
  it("accepts operator assets without editing product code", () => {
    expect(readPublicBranding({ NEXT_PUBLIC_SITE_LOGO: " /site/logo.png ",
      NEXT_PUBLIC_SITE_SOCIAL_IMAGE: "/site/share.webp", NEXT_PUBLIC_SITE_ILLUSTRATION: "/site/hero.svg",
      NEXT_PUBLIC_SITE_DESCRIPTION: " My learning site " })).toEqual({ logo: "/site/logo.png",
      socialImage: "/site/share.webp", illustration: "/site/hero.svg", description: "My learning site" });
  });
  it.each(["//evil.example/logo.svg", "https://example.com/logo.png", "/../logo.png", "/site/%2e/logo.png",
    "/api/private.png", "/site/logo.png?token=secret", "data:image/svg+xml,secret", "/site\\logo.png"])("rejects unsafe asset %s", (value) => {
    expect(() => readPublicBranding({ NEXT_PUBLIC_SITE_LOGO: value })).toThrow("NEXT_PUBLIC_SITE_LOGO");
    try { readPublicBranding({ NEXT_PUBLIC_SITE_LOGO: value }); } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
  it("rejects oversized descriptions", () => {
    expect(() => readPublicBranding({ NEXT_PUBLIC_SITE_DESCRIPTION: "x".repeat(301) })).toThrow("NEXT_PUBLIC_SITE_DESCRIPTION");
  });
  it("uses the same configured identity for the web manifest", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_NAME", "Example School");
    vi.stubEnv("NEXT_PUBLIC_SITE_LOGO", "/site/school.png");
    try {
      const { default: manifest } = await import("../../app/manifest");
      expect(manifest()).toMatchObject({ name: "Example School", icons: [{ src: "/site/school.png" }] });
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it("wires shared branding into desktop/mobile and metadata without file overrides", () => {
    for (const file of ["src/components/layout/header.tsx", "src/components/layout/mobile-drawer.tsx", "src/app/layout.tsx", "src/components/join/subscribe-page.tsx"]) {
      expect(readFileSync(file, "utf8")).toContain("PUBLIC_BRANDING.logo");
      expect(readFileSync(file, "utf8")).not.toContain('"/oss/icon.svg"');
    }
    for (const file of ["icon.png", "apple-icon.png", "opengraph-image.png", "twitter-image.png"]) {
      expect(existsSync(`src/app/${file}`)).toBe(false);
    }
  });
});
