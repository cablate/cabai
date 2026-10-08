/**
 * Plan slug validation rules.
 *
 * Shared by:
 *  - admin server action (src/actions/plans.ts setPlanSlug…)
 *  - agent PATCH endpoint (src/app/api/agent/plans/[id]/route.ts)
 *  - admin client form (mirror of server validation for inline feedback)
 *
 * Keep the rules strict — slug becomes part of public URLs and can shadow
 * top-level routes if reserved words slip through.
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_LEN = 3;
const MAX_LEN = 60;

/**
 * Reserved words a plan slug cannot use. Anything that conflicts with a
 * top-level public route, an admin/api namespace, or a route segment we
 * might add later. Includes a few obvious would-be-confusing names.
 */
export const RESERVED_PLAN_SLUGS = new Set<string>([
  // Public top-level routes
  "products",
  "checkout",
  "preview",
  "courses",
  "login",
  "cancel",
  "success",
  "privacy",
  "terms",
  "refund",
  "sitemap",
  "robots",
  // Protected top-level routes
  "my",
  "dashboard",
  "content",
  // Admin / API namespaces
  "admin",
  "api",
  "auth",
  // Static asset paths used by Next
  "_next",
  "static",
  "favicon",
  // Internal sentinels
  "new",
  "edit",
  "delete",
  "create",
  "settings",
  "search",
  "index",
  "null",
  "undefined",
]);

export type PlanSlugValidationError =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "looks_like_uuid"
  | "reserved";

export type PlanSlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; error: PlanSlugValidationError; message: string };

/**
 * Validate a candidate plan slug. Returns the normalised slug on success.
 * Does NOT check DB uniqueness — that is the caller's responsibility
 * (admin server action or agent endpoint), since it requires a DB query.
 *
 * Pass `null` or empty string to indicate "clear the slug". Callers must
 * handle that as a separate code path before calling this function.
 */
export function validatePlanSlug(input: string): PlanSlugValidationResult {
  const slug = input.trim().toLowerCase();

  if (!slug) {
    return { ok: false, error: "empty", message: "Slug 不可為空" };
  }

  // Reserved-word check runs before length so short reserved words (`my`,
  // `api`) report the actionable reason rather than "too short". Changing
  // length wouldn't help — the user needs a different word.
  if (RESERVED_PLAN_SLUGS.has(slug)) {
    return {
      ok: false,
      error: "reserved",
      message: `"${slug}" 是保留字，請換一個`,
    };
  }

  if (slug.length < MIN_LEN) {
    return {
      ok: false,
      error: "too_short",
      message: `Slug 至少 ${MIN_LEN} 個字元`,
    };
  }

  if (slug.length > MAX_LEN) {
    return {
      ok: false,
      error: "too_long",
      message: `Slug 不可超過 ${MAX_LEN} 個字元`,
    };
  }

  if (UUID_SHAPE.test(slug)) {
    return {
      ok: false,
      error: "looks_like_uuid",
      message: "Slug 不可長得像 UUID（會跟 ID 路由衝突）",
    };
  }

  if (!SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      error: "invalid_format",
      message: "Slug 只能用小寫英文、數字、連字號，且不可以連字號開頭/結尾或連續連字號",
    };
  }

  return { ok: true, slug };
}

/**
 * Used by the resolver: a slug that looks like a UUID would be picked up
 * by the UUID path of the resolver, never the slug path. Reject early.
 */
export function looksLikeUuid(value: string): boolean {
  return UUID_SHAPE.test(value);
}
