import { z } from "zod";

export type SiteIdentityEnvironment = Record<string, string | undefined>;

export interface SiteIdentity {
  brandName: string;
  brandInitial: string;
  legalName: string;
  contactEmail: string;
  defaultLocale: string;
  assetOrigin?: string;
}

export interface SiteIdentityIssue {
  key: string;
  message: string;
}

const emailSchema = z.string().trim().email().max(254);
const nameSchema = z.string().trim().min(1).max(120);
const initialSchema = z.string().trim().min(1).max(4);
const localeSchema = z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35);
const httpsOriginSchema = z.string().url().transform((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    context.addIssue({ code: "custom", message: "must be an HTTPS origin without path, credentials, query, or fragment" });
    return z.NEVER;
  }
  return url.origin;
});

const DEFAULT_CONTACT_EMAIL = "support@example.com";

function parseOrFallback<T>(
  key: string,
  value: string | undefined,
  fallback: T,
  schema: z.ZodType<T>,
  issues: SiteIdentityIssue[],
): T {
  if (!value?.trim()) return fallback;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  issues.push({ key, message: parsed.error.issues[0]?.message ?? "is invalid" });
  return fallback;
}

export function inspectSiteIdentity(env: SiteIdentityEnvironment = process.env): {
  value: SiteIdentity;
  issues: SiteIdentityIssue[];
} {
  const issues: SiteIdentityIssue[] = [];
  const assetValue = env.NEXT_PUBLIC_ASSET_HOST?.trim() || env.CLOUDFLARE_R2_PUBLIC_URL?.trim();

  const value: SiteIdentity = {
    brandName: parseOrFallback("NEXT_PUBLIC_SITE_NAME", env.NEXT_PUBLIC_SITE_NAME, "CabAI", nameSchema, issues),
    brandInitial: parseOrFallback("NEXT_PUBLIC_SITE_INITIAL", env.NEXT_PUBLIC_SITE_INITIAL, "AI", initialSchema, issues),
    legalName: parseOrFallback("SITE_LEGAL_NAME", env.SITE_LEGAL_NAME, "CabAI", nameSchema, issues),
    contactEmail: parseOrFallback("CONTACT_EMAIL", env.CONTACT_EMAIL, DEFAULT_CONTACT_EMAIL, emailSchema, issues),
    defaultLocale: parseOrFallback("SITE_DEFAULT_LOCALE", env.SITE_DEFAULT_LOCALE, "zh-TW", localeSchema, issues),
    ...(assetValue
      ? { assetOrigin: parseOrFallback("NEXT_PUBLIC_ASSET_HOST", assetValue, undefined, httpsOriginSchema.optional(), issues) }
      : {}),
  };

  if (value.assetOrigin === undefined) delete value.assetOrigin;
  return { value, issues };
}

export function getSiteIdentity(env: SiteIdentityEnvironment = process.env): SiteIdentity {
  const inspection = inspectSiteIdentity(env);
  if (inspection.issues.length > 0) {
    throw new Error(`Invalid site identity configuration: ${inspection.issues.map((issue) => issue.key).join(", ")}`);
  }
  return inspection.value;
}

export const CONTACT_EMAIL = getSiteIdentity().contactEmail;
