import { describe, expect, it } from "vitest";
import { buildPublicSitemap, loadSitemapSources } from "./sitemap";

describe("buildPublicSitemap", () => {
  it("only lists canonical public discovery pages and published details", () => {
    const productUpdatedAt = new Date("2026-07-01T00:00:00.000Z");
    const libraryUpdatedAt = new Date("2026-07-02T00:00:00.000Z");
    const skillPublishedAt = new Date("2026-07-03T00:00:00.000Z");
    const result = buildPublicSitemap({
      baseUrl: "https://cabai.example/",
      publishedPlans: [
        { id: "plan-id", slug: "course", lastModified: productUpdatedAt },
        { id: "fallback-id", slug: null, lastModified: null },
      ],
      libraryEntries: [{ slug: "article", updatedAt: libraryUpdatedAt }],
      skills: [{
        slug: "helper",
        currentRelease: { publishedAt: skillPublishedAt },
      }],
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://cabai.example",
      "https://cabai.example/products",
      "https://cabai.example/information",
      "https://cabai.example/library",
      "https://cabai.example/skills",
      "https://cabai.example/community",
      "https://cabai.example/privacy",
      "https://cabai.example/terms",
      "https://cabai.example/products/course",
      "https://cabai.example/products/fallback-id",
      "https://cabai.example/library/article",
      "https://cabai.example/skills/helper",
    ]);
    expect(result.some((entry) => entry.url.endsWith("/login"))).toBe(false);
    expect(result[8]?.lastModified).toBe(productUpdatedAt);
    expect(result[9]?.lastModified).toBeUndefined();
    expect(result[10]?.lastModified).toBe(libraryUpdatedAt);
    expect(result[11]?.lastModified).toBe(skillPublishedAt);
  });

  it("does not invent request-time modification dates for static pages", () => {
    const result = buildPublicSitemap({
      baseUrl: "https://cabai.example",
      publishedPlans: [],
      libraryEntries: [],
      skills: [],
    });

    expect(result).toHaveLength(8);
    expect(result.every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it("uses the page content timestamp for published product URLs", () => {
    const lastModified = new Date("2026-08-14T00:00:00.000Z");
    const result = buildPublicSitemap({
      baseUrl: "https://cabai.example",
      publishedPlans: [{ id: "course-id", slug: "course", lastModified }],
      libraryEntries: [],
      skills: [],
    });

    expect(result.find((entry) => entry.url.endsWith("/products/course")))
      .toMatchObject({ lastModified });
  });

  it("keeps healthy sources available when one dynamic source fails", async () => {
    const result = await loadSitemapSources(
      {
        plans: async () => {
          throw new Error("database unavailable");
        },
        library: async () => ["article"],
        skills: async () => ["skill"],
      },
      { plans: [] as string[], library: [] as string[], skills: [] as string[] },
    );

    expect(result).toEqual({
      plans: [],
      library: ["article"],
      skills: ["skill"],
      failedSources: ["plans"],
    });
  });

  it("returns explicit fallbacks instead of rejecting the whole sitemap", async () => {
    const result = await loadSitemapSources(
      {
        plans: async () => ["course"],
        library: async () => {
          throw new Error("library unavailable");
        },
        skills: async () => {
          throw new Error("skills unavailable");
        },
      },
      { plans: [] as string[], library: [] as string[], skills: [] as string[] },
    );

    expect(result).toEqual({
      plans: ["course"],
      library: [],
      skills: [],
      failedSources: ["library", "skills"],
    });
  });
});
