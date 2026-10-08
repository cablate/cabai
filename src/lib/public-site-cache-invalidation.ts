import { revalidateTag } from "next/cache";
import { createLogger } from "@/lib/logger";
import {
  PUBLIC_SITE_CACHE_TAGS,
  type PublicSiteCacheArea,
} from "@/lib/public-site-cache-tags";

const logger = createLogger("public-site-cache");

/**
 * Expire public catalog data after a successful mutation has committed.
 *
 * This helper must run from a Server Action or Route Handler request context.
 * Keeping it outside database transactions prevents a cache side effect from
 * being emitted for a mutation that later rolls back.
 */
export function expirePublicSiteCache(...areas: PublicSiteCacheArea[]): void {
  for (const area of new Set(areas)) {
    try {
      revalidateTag(PUBLIC_SITE_CACHE_TAGS[area], { expire: 0 });
    } catch (error) {
      // The database mutation has already committed. Do not report it as
      // failed merely because this non-transactional cache side effect failed.
      logger.warn("Failed to expire public site cache", {
        area,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
