import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { looksLikeUuid } from "@/lib/validate-plan-slug";

export type LocalPlan = typeof plans.$inferSelect;

export async function getLocalPlans() {
  return db.select().from(plans).where(eq(plans.status, "active"));
}

export async function getLocalPlan(planId: string) {
  return db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });
}

export async function getAllLocalPlans() {
  return db.select().from(plans);
}

/**
 * Look up a plan by either its UUID `id` or its `slug`.
 *
 * Route params come in as a single `[idOrSlug]` segment — we can't tell
 * which the caller intended without inspecting the value. Strategy:
 *
 *   1. If the value has the exact UUID 8-4-4-4-12 shape, try the id
 *      column directly. UUID-shaped slugs are rejected at validation
 *      time, so a UUID-shaped value can only ever be an id.
 *   2. Otherwise try slug first (the URL-canonical field), then fall
 *      back to id. Agent-created plans may use friendly non-UUID ids
 *      (e.g. "ai-coding-pain-points-manual"); the fallback lets those
 *      ids stay reachable even after the slug is changed.
 *
 * Returns the plan (or undefined if neither path matches). Caller decides
 * what 404 / redirect behaviour fits — this function does not throw.
 */
export async function resolvePlanByIdOrSlug(idOrSlug: string) {
  if (looksLikeUuid(idOrSlug)) {
    return getLocalPlan(idOrSlug);
  }
  const bySlug = await db.query.plans.findFirst({
    where: eq(plans.slug, idOrSlug),
  });
  if (bySlug) return bySlug;
  return db.query.plans.findFirst({
    where: eq(plans.id, idOrSlug),
  });
}
