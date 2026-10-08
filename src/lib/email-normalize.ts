/**
 * F-09: email normalisation for lookups + cross-service identity checks.
 *
 * Two layers:
 *
 *   1. Trim + lowercase. Always safe; doesn't change semantics.
 *
 *   2. Gmail / Googlemail alias collapse:
 *      - dots in the local part are ignored by Gmail
 *      - everything after `+` in the local part is ignored
 *      - googlemail.com is an alias of gmail.com
 *
 *      Without collapsing, an attacker registered as `a.b+1@gmail.com`
 *      is a different account from `ab@gmail.com` in our DB but the
 *      same identity to Google — which means per-account limits
 *      (signup, coupon, trial, free quota) can be bypassed by minting
 *      new aliases of the same underlying mailbox.
 *
 * Other providers don't follow this convention reliably (Outlook,
 * Yahoo, custom domains all differ), so we deliberately do NOT strip
 * `+tag` for them — that would create false identity collisions and
 * could grant cross-account access.
 *
 * Use `normalizeEmail()` for identity equality checks. Use
 * `emailLooksValid()` only as a cheap shape guard (zod is still the
 * authoritative validator).
 */

export function normalizeEmail(rawEmail: string): string {
  const trimmed = rawEmail.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    const canonicalLocal = local.replace(/\+.*$/, "").replace(/\./g, "");
    return `${canonicalLocal}@gmail.com`;
  }

  return trimmed;
}

export function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
