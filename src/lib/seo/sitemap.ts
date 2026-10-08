import type { MetadataRoute } from "next";

type SitemapPublishedPlan = {
  id: string;
  slug: string | null;
  lastModified: Date | null;
};

type SitemapLibraryEntry = {
  slug: string;
  updatedAt: Date;
};

type SitemapSkill = {
  slug: string;
  currentRelease: {
    publishedAt: Date;
  };
};

type BuildPublicSitemapInput = {
  baseUrl: string;
  publishedPlans: SitemapPublishedPlan[];
  libraryEntries: SitemapLibraryEntry[];
  skills: SitemapSkill[];
};

type SitemapSourceLoaders<TPlans, TLibrary, TSkills> = {
  plans: () => Promise<TPlans>;
  library: () => Promise<TLibrary>;
  skills: () => Promise<TSkills>;
};

export type SitemapSourceName = "plans" | "library" | "skills";

export async function loadSitemapSources<TPlans, TLibrary, TSkills>(
  loaders: SitemapSourceLoaders<TPlans, TLibrary, TSkills>,
  fallbacks: { plans: TPlans; library: TLibrary; skills: TSkills },
): Promise<{
  plans: TPlans;
  library: TLibrary;
  skills: TSkills;
  failedSources: SitemapSourceName[];
}> {
  const [plans, library, skills] = await Promise.allSettled([
    loaders.plans(),
    loaders.library(),
    loaders.skills(),
  ]);
  const failedSources: SitemapSourceName[] = [];

  if (plans.status === "rejected") failedSources.push("plans");
  if (library.status === "rejected") failedSources.push("library");
  if (skills.status === "rejected") failedSources.push("skills");

  return {
    plans: plans.status === "fulfilled" ? plans.value : fallbacks.plans,
    library: library.status === "fulfilled" ? library.value : fallbacks.library,
    skills: skills.status === "fulfilled" ? skills.value : fallbacks.skills,
    failedSources,
  };
}

const PUBLIC_INDEX_PATHS = [
  "",
  "/products",
  "/information",
  "/library",
  "/skills",
  "/community",
  "/privacy",
  "/terms",
] as const;

export function buildPublicSitemap({
  baseUrl,
  publishedPlans,
  libraryEntries,
  skills,
}: BuildPublicSitemapInput): MetadataRoute.Sitemap {
  const origin = baseUrl.replace(/\/$/, "");
  const staticPages = PUBLIC_INDEX_PATHS.map((path) => ({
    url: `${origin}${path}`,
  }));
  const productPages = publishedPlans.map((plan) => ({
    url: `${origin}/products/${plan.slug ?? plan.id}`,
    ...(plan.lastModified ? { lastModified: plan.lastModified } : {}),
  }));
  const libraryPages = libraryEntries.map((entry) => ({
    url: `${origin}/library/${entry.slug}`,
    lastModified: entry.updatedAt,
  }));
  const skillPages = skills.map((skill) => ({
    url: `${origin}/skills/${skill.slug}`,
    lastModified: skill.currentRelease.publishedAt,
  }));

  return [...staticPages, ...productPages, ...libraryPages, ...skillPages];
}
