const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function estimateLibraryReadingMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, " "))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ");
  const cjkCharacters = text.match(CJK_RE)?.length ?? 0;
  const latinWords = text.match(LATIN_WORD_RE)?.length ?? 0;

  return Math.max(1, Math.ceil(cjkCharacters / 400 + latinWords / 200));
}

export function hasMeaningfulLibraryUpdate(
  publishedAt: Date | null,
  updatedAt: Date,
): boolean {
  if (!publishedAt) return false;
  return updatedAt.getTime() - publishedAt.getTime() >= 60_000;
}
