export type MarkdownHeading = {
  level: number;
  text: string;
  id: string;
  line: number;
};

export function headingSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\](){}<>]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

export function extractMarkdownHeadings(
  content: string,
  demoteTopHeading = false,
): MarkdownHeading[] {
  const seen = new Map<string, number>();
  let inFence = false;

  return content.split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return [];
    }
    if (inFence) return [];

    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return [];

    const rawLevel = match[1]!.length;
    const level = demoteTopHeading && rawLevel === 1 ? 2 : rawLevel;
    const text = match[2]!
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    const baseId = headingSlug(text);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);

    return [
      {
        level,
        text,
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        line: index + 1,
      },
    ];
  });
}
