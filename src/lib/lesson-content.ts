export type LessonContentType = "video" | "text" | "pdf" | "download";
export type LessonResourceType = "video" | "pdf" | "download" | "link";

export interface LessonResource {
  id: string;
  type: LessonResourceType;
  title: string;
  url: string;
  sortOrder: number;
}

const EMBED_PATTERNS = [
  /youtube\.com\/embed\//i,
  /player\.vimeo\.com\/video\//i,
  /dailymotion\.com\/embed\//i,
  /player\./i,
  /\/embed\//i,
];

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    } else if (url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  }

  if (!videoId) return null;

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  const start = url.searchParams.get("start") ?? url.searchParams.get("t");
  if (start) {
    const seconds = start.endsWith("s") ? start.slice(0, -1) : start;
    if (/^\d+$/.test(seconds)) embedUrl.searchParams.set("start", seconds);
  }
  return embedUrl.toString();
}

function normalizeVimeoUrl(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "player.vimeo.com") return url.toString();
  if (host !== "vimeo.com") return null;

  const videoId = url.pathname.split("/").filter(Boolean)[0];
  if (!videoId || !/^\d+$/.test(videoId)) return null;
  return `https://player.vimeo.com/video/${videoId}`;
}

export function normalizeVideoUrl(value: string): string {
  const trimmed = value.trim();
  const url = toUrl(trimmed);
  if (!url) return trimmed;

  return normalizeYouTubeUrl(url) ?? normalizeVimeoUrl(url) ?? trimmed;
}

export function isEmbeddableVideoUrl(value: string): boolean {
  return EMBED_PATTERNS.some((pattern) => pattern.test(value));
}

export function normalizeLessonContent(
  type: LessonContentType,
  content: string,
): string {
  if (type === "video") return normalizeVideoUrl(content);
  return content;
}

export function stripDuplicateLeadingHeading(content: string, title?: string): string {
  if (!title) return content;
  const match = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(content);
  if (!match || match[1]?.trim() !== title.trim()) return content;
  return content.slice(match[0].length).replace(/^\s*\r?\n/, "");
}

function normalizeResourceType(value: unknown): LessonResourceType {
  if (value === "video" || value === "pdf" || value === "download" || value === "link") {
    return value;
  }
  return "link";
}

function titleFromUrl(value: string): string | null {
  const url = toUrl(value);
  const pathname = url?.pathname ?? value;
  const segment = pathname.split(/[\\/]/).filter(Boolean).pop();
  if (!segment) return null;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function fallbackResourceTitle(type: LessonResourceType, url: string): string {
  if (type === "video") return "補充影片";

  const fileName = titleFromUrl(url);
  if (fileName) return fileName;

  switch (type) {
    case "pdf":
      return "PDF 資源";
    case "download":
      return "下載檔案";
    case "link":
    default:
      return "補充連結";
  }
}

export function normalizeLessonResources(value: unknown): LessonResource[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const type = normalizeResourceType(record.type);
      const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!rawUrl) return null;

      return {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : crypto.randomUUID(),
        type,
        title: title || fallbackResourceTitle(type, rawUrl),
        url: type === "video" ? normalizeVideoUrl(rawUrl) : rawUrl,
        sortOrder:
          typeof record.sortOrder === "number" && Number.isFinite(record.sortOrder)
            ? record.sortOrder
            : index,
      };
    })
    .filter((item): item is LessonResource => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function parseLessonResources(value: unknown): LessonResource[] {
  if (typeof value === "string") {
    try {
      return normalizeLessonResources(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return normalizeLessonResources(value);
}

export function serializeLessonResources(value: unknown): LessonResource[] {
  return normalizeLessonResources(value).map((resource, index) => ({
    ...resource,
    sortOrder: index,
  }));
}
