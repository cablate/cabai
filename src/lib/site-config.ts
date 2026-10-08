/**
 * site-config.ts — Key-value site-wide configuration store.
 *
 * Used for settings that need admin UI editing but don't warrant
 * a full table structure. Stored in the `site_config` table.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteConfig } from "@/lib/db/schema";

export const editableSiteConfigKeys = ["default_discord_role_id"] as const;
export type SiteConfigKey = (typeof editableSiteConfigKeys)[number];

export function assertSiteConfigKey(key: string): asserts key is SiteConfigKey {
  if (!(editableSiteConfigKeys as readonly string[]).includes(key)) {
    throw new Error("Site configuration key is not editable.");
  }
}

/**
 * Get a site config value by key.
 * Returns `null` if the key is not set.
 */
export async function getSiteConfig(key: SiteConfigKey): Promise<string | null> {
  const row = await db.query.siteConfig.findFirst({
    where: eq(siteConfig.key, key),
    columns: { value: true },
  });
  return row?.value ?? null;
}

/**
 * Set a site config value (upsert).
 * If the key already exists, it updates the value; otherwise inserts.
 */
export async function setSiteConfig(key: SiteConfigKey, value: string): Promise<void> {
  assertSiteConfigKey(key);
  await db
    .insert(siteConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value } });
}

/**
 * Delete a site config entry.
 */
export async function deleteSiteConfig(key: SiteConfigKey): Promise<void> {
  assertSiteConfigKey(key);
  await db.delete(siteConfig).where(eq(siteConfig.key, key));
}
