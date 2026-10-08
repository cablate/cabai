import { unstable_cache } from "next/cache";
import { getPublishedPlanPresentations } from "@/lib/plan-presentations";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";
import { listPublicSkills } from "@/lib/services/skill-release-service";
import { PUBLIC_SITE_CACHE_TAGS } from "@/lib/public-site-cache-tags";

const PUBLIC_SITE_REVALIDATE_SECONDS = 60;

/**
 * Public catalog data changes far less often than it is read. Keep the cache
 * boundary outside the domain services so API and admin callers retain their
 * existing real-time behavior while public pages can share results.
 */
export const getCachedPublishedPlanPresentations = unstable_cache(
  () => getPublishedPlanPresentations(),
  ["public-site-plan-presentations-v1"],
  {
    revalidate: PUBLIC_SITE_REVALIDATE_SECONDS,
    tags: [PUBLIC_SITE_CACHE_TAGS.plans],
  },
);

export const getCachedPublishedLibraryEntries = unstable_cache(
  () => listPublishedLibraryEntries(),
  ["public-site-library-entries-v1"],
  {
    revalidate: PUBLIC_SITE_REVALIDATE_SECONDS,
    tags: [PUBLIC_SITE_CACHE_TAGS.library],
  },
);

export const getCachedPublicSkills = unstable_cache(
  () => listPublicSkills({ authenticated: false }),
  ["public-site-skills-v1"],
  {
    revalidate: PUBLIC_SITE_REVALIDATE_SECONDS,
    tags: [PUBLIC_SITE_CACHE_TAGS.skills],
  },
);
