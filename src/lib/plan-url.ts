/**
 * Build canonical paths for a plan across the three user-facing routes.
 *
 * Prefer `slug` when set, fall back to `id`. Any link that takes a user
 * to /products, /checkout, or /my SHOULD go through this helper so that
 * the canonical URL is consistent and updating slug later flips every
 * link at once.
 */

export type PlanUrlKind = "product" | "checkout" | "my";

type Identifiable = { id: string; slug?: string | null };

const SEGMENT: Record<PlanUrlKind, string> = {
  product: "products",
  checkout: "checkout",
  my: "my",
};

export function planPath(plan: Identifiable, kind: PlanUrlKind): string {
  const seg = plan.slug ?? plan.id;
  return `/${SEGMENT[kind]}/${seg}`;
}
