import { describe, expect, it } from "vitest";
import type { LibraryPublicSummary } from "@/lib/services/library-service";
import {
  selectHomeLibraryEntries,
  selectRelatedLibraryEntries,
  normalizeCachedLibraryEntry,
} from "./library-discovery";

function entry(
  id: string,
  overrides: Partial<LibraryPublicSummary> = {},
): LibraryPublicSummary {
  return {
    id,
    slug: id,
    title: id,
    summary: `${id} summary`,
    tags: [],
    featured: false,
    revision: 1,
    publishedAt: new Date(`2026-07-${id.padStart(2, "0")}T00:00:00.000Z`),
    updatedAt: new Date(`2026-07-${id.padStart(2, "0")}T00:00:00.000Z`),
    ...overrides,
  };
}

describe("Library internal discovery", () => {
  it("keeps the homepage entry compact and prioritizes featured content", () => {
    const result = selectHomeLibraryEntries([
      entry("01"),
      entry("04"),
      entry("02", { featured: true }),
      entry("03"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["02", "04", "03"]);
  });

  it("restores dates serialized by the Next public cache before sorting and rendering", () => {
    const cached = {
      ...entry("01"),
      publishedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    } as unknown as LibraryPublicSummary;

    const normalized = normalizeCachedLibraryEntry(cached);
    expect(normalized.publishedAt).toBeInstanceOf(Date);
    expect(normalized.updatedAt).toBeInstanceOf(Date);
    expect(selectHomeLibraryEntries([normalized])).toHaveLength(1);
  });

  it("ranks shared tags before recency, excludes the current article, and caps results", () => {
    const current = entry("01", { tags: ["Agent", "SEO"] });
    const result = selectRelatedLibraryEntries(current, [
      current,
      entry("05"),
      entry("02", { tags: ["Agent"] }),
      entry("03", { tags: ["Agent", "SEO"] }),
      entry("04", { tags: ["SEO"] }),
    ]);

    expect(result.hasTagMatch).toBe(true);
    expect(result.entries.map(({ id }) => id)).toEqual(["03", "04", "02"]);
  });

  it("falls back to latest published content without claiming a tag relationship", () => {
    const result = selectRelatedLibraryEntries(
      entry("01", { tags: ["Agent"] }),
      [entry("02"), entry("03")],
    );

    expect(result.hasTagMatch).toBe(false);
    expect(result.entries.map(({ id }) => id)).toEqual(["03", "02"]);
  });
});
