import type { LibraryPublicSummary } from "@/lib/services/library-service";

function normalizeDate(value: unknown, field: string): Date {
  const date = value instanceof Date
    ? value
    : new Date(typeof value === "string" || typeof value === "number" ? value : Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid cached Library ${field}.`);
  }
  return date;
}

export function normalizeCachedLibraryEntry(
  entry: LibraryPublicSummary,
): LibraryPublicSummary {
  return {
    ...entry,
    publishedAt: entry.publishedAt
      ? normalizeDate(entry.publishedAt, "publishedAt")
      : null,
    updatedAt: normalizeDate(entry.updatedAt, "updatedAt"),
  };
}

function publishedTime(entry: LibraryPublicSummary): number {
  return entry.publishedAt?.getTime() ?? 0;
}

function stableNewestFirst(
  left: LibraryPublicSummary,
  right: LibraryPublicSummary,
): number {
  return publishedTime(right) - publishedTime(left)
    || left.slug.localeCompare(right.slug, "zh-TW");
}

export function selectHomeLibraryEntries(
  entries: LibraryPublicSummary[],
  limit = 3,
): LibraryPublicSummary[] {
  return [...entries]
    .sort((left, right) =>
      Number(right.featured) - Number(left.featured) || stableNewestFirst(left, right))
    .slice(0, limit);
}

export function selectRelatedLibraryEntries(
  current: LibraryPublicSummary,
  entries: LibraryPublicSummary[],
  limit = 3,
): {
  entries: LibraryPublicSummary[];
  hasTagMatch: boolean;
} {
  const currentTags = new Set(current.tags);
  const ranked = entries
    .filter((entry) => entry.id !== current.id)
    .map((entry) => ({
      entry,
      sharedTags: entry.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .sort((left, right) =>
      right.sharedTags - left.sharedTags
      || stableNewestFirst(left.entry, right.entry));

  return {
    entries: ranked.slice(0, limit).map(({ entry }) => entry),
    hasTagMatch: ranked.some(({ sharedTags }) => sharedTags > 0),
  };
}
