/** Public build-time identity only. Never place credentials in NEXT_PUBLIC_* values. */
export function readPublicBranding(env: Record<string, string | undefined>) {
  function asset(key: string, fallback: string) {
    const value = env[key]?.trim() || fallback;
    // Same-origin static images only: no remote fetch, signed query, traversal or API route.
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|webp|jpg|jpeg|ico)$/.test(value) || value.startsWith("/api/")) {
      throw new Error("Invalid public branding configuration: " + key);
    }
    return value;
  }
  const description = env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() || "探索課程、文章與學習資源，依權限取得內容。";
  if (description.length > 300) throw new Error("Invalid public branding configuration: NEXT_PUBLIC_SITE_DESCRIPTION");
  return {
    description,
    logo: asset("NEXT_PUBLIC_SITE_LOGO", "/oss/icon.svg"),
    socialImage: asset("NEXT_PUBLIC_SITE_SOCIAL_IMAGE", "/oss/social.png"),
    illustration: asset("NEXT_PUBLIC_SITE_ILLUSTRATION", "/oss/learning.svg"),
  };
}

// Explicit property accesses are required for Next.js client build-time replacement.
export const PUBLIC_BRANDING = readPublicBranding({
  NEXT_PUBLIC_SITE_DESCRIPTION: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
  NEXT_PUBLIC_SITE_LOGO: process.env.NEXT_PUBLIC_SITE_LOGO,
  NEXT_PUBLIC_SITE_SOCIAL_IMAGE: process.env.NEXT_PUBLIC_SITE_SOCIAL_IMAGE,
  NEXT_PUBLIC_SITE_ILLUSTRATION: process.env.NEXT_PUBLIC_SITE_ILLUSTRATION,
});
