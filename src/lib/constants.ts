// Brand
export const BRAND_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "CabAI";
export const BRAND_INITIAL = process.env.NEXT_PUBLIC_SITE_INITIAL?.trim() || "AI";
export const CREATOR_NAME = process.env.NEXT_PUBLIC_CREATOR_NAME?.trim() || "Site Creator";
export const CREATOR_URL = process.env.NEXT_PUBLIC_CREATOR_URL?.trim() || "https://example.com";

// Lesson types
export const LESSON_TYPE_LABELS: Record<string, string> = {
  video: "影片",
  text: "文章",
  pdf: "PDF",
  download: "下載",
};
