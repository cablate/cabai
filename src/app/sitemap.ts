import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/app-url";
import { getAllPublishedPlanPresentations } from "@/lib/plan-presentations";
import { createLogger } from "@/lib/logger";
import { buildPublicSitemap, loadSitemapSources } from "@/lib/seo/sitemap";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";
import { listPublicSkills } from "@/lib/services/skill-release-service";

export const dynamic = "force-dynamic";

const logger = createLogger("public-sitemap");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sources = await loadSitemapSources(
    {
      plans: getAllPublishedPlanPresentations,
      library: listPublishedLibraryEntries,
      skills: () => listPublicSkills({ authenticated: false }),
    },
    {
      plans: [],
      library: null,
      skills: null,
    },
  );

  if (sources.failedSources.length > 0) {
    logger.error("Public sitemap generated with unavailable dynamic sources", {
      failedSources: sources.failedSources,
    });
  }

  return buildPublicSitemap({
    baseUrl: getAppBaseUrl(),
    publishedPlans: sources.plans.map(({ plan, presentation }) => ({
      id: plan.id,
      slug: plan.slug,
      lastModified: new Date(
        Math.max(plan.syncedAt.getTime(), presentation.updatedAt.getTime()),
      ),
    })),
    libraryEntries: sources.library?.ok ? sources.library.value : [],
    skills: sources.skills?.ok ? sources.skills.value : [],
  });
}
