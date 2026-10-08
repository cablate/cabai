export const PUBLIC_SITE_CACHE_TAGS = {
  plans: "public-site-plans",
  library: "public-site-library",
  skills: "public-site-skills",
} as const;

export type PublicSiteCacheArea = keyof typeof PUBLIC_SITE_CACHE_TAGS;
