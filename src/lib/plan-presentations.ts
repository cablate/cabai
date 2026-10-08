import { db } from "@/lib/db";
import { plans, planPresentations } from "@/lib/db/schema";
import { eq, and, isNotNull, lte, desc, asc, isNull, sql } from "drizzle-orm";
import type { PlanPresentation, Plan } from "@/lib/db/schema";
import type { OfferingType } from "@/lib/validations/plan-presentations";

const FEATURED_SORT_ORDER_FALLBACK = 1_000_000;

function publicPresentationConditions(now: Date) {
  return [
    eq(plans.status, "active"),
    isNull(planPresentations.deletedAt),
    isNotNull(planPresentations.publishedAt),
    lte(planPresentations.publishedAt, now),
  ];
}

export function isPublicPlanPresentation(
  plan: Pick<Plan, "status">,
  presentation:
    | Pick<PlanPresentation, "publishedAt" | "deletedAt">
    | null
    | undefined,
  now: Date = new Date()
): boolean {
  return (
    plan.status === "active" &&
    presentation?.deletedAt === null &&
    presentation.publishedAt !== null &&
    presentation.publishedAt <= now
  );
}

/**
 * Error thrown when a presentation is not found.
 * Safe for user-facing error handling.
 */
export class PresentationNotFoundError extends Error {
  constructor(planId: string) {
    super(`Presentation for plan ${planId} not found`);
    this.name = "PresentationNotFoundError";
  }
}

/**
 * Get a presentation for a single plan.
 * Does not include plan source data.
 *
 * @param planId - Portaly plan ID
 * @returns PlanPresentation or throws PresentationNotFoundError
 */
export async function getPlanPresentation(
  planId: string
): Promise<PlanPresentation> {
  const result = await db
    .select()
    .from(planPresentations)
    .where(eq(planPresentations.planId, planId))
    .limit(1);

  if (result.length === 0) {
    throw new PresentationNotFoundError(planId);
  }

  return result[0]!;
}

/**
 * Get plan source data + presentation data.
 * Intended for detail pages, checkout, member hub.
 *
 * @param planId - Portaly plan ID
 * @returns { plan, presentation } or throws if plan not found
 */
export async function getPlanWithPresentation(
  planId: string
): Promise<{
  plan: Plan;
  presentation: PlanPresentation | null;
}> {
  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (planResult.length === 0) {
    throw new Error(`Plan ${planId} not found`);
  }

  const plan = planResult[0]!;

  // Presentation is optional (may not exist during setup)
  let presentation: PlanPresentation | null = null;
  try {
    presentation = await getPlanPresentation(planId);
  } catch (error) {
    if (!(error instanceof PresentationNotFoundError)) {
      throw error;
    }
    // Presentation not found is ok, leave as null
  }

  return { plan, presentation };
}

/**
 * Get featured presentations, sorted by display order.
 * Includes plan source data (for price, billing, status).
 * Returns empty array if no featured presentations.
 *
 * Query used on: homepage, featured banner component
 *
 * @returns Array of { plan, presentation } sorted by featuredSortOrder
 */
export async function getFeaturedPlanPresentations(): Promise<
  Array<{
    plan: Plan;
    presentation: PlanPresentation;
  }>
> {
  const now = new Date();

  const results = await db
    .select({
      plan: plans,
      presentation: planPresentations,
    })
    .from(planPresentations)
    .innerJoin(plans, eq(planPresentations.planId, plans.id))
    .where(
      and(
        eq(planPresentations.isFeatured, true),
        ...publicPresentationConditions(now)
      )
    )
    .orderBy(
      asc(
        sql<number>`coalesce(${planPresentations.featuredSortOrder}, ${FEATURED_SORT_ORDER_FALLBACK})`
      ),
      desc(planPresentations.publishedAt)
    );

  return results;
}

/**
 * Get published presentations.
 * Published = publishedAt is not null and <= now.
 * Returns all offering types.
 *
 * Query used on: products page, explore page, member hub
 *
 * @param limit - max results (default 100)
 * @param offset - pagination offset (default 0)
 * @returns Array of { plan, presentation }
 */
export async function getPublishedPlanPresentations(
  limit: number = 100,
  offset: number = 0
): Promise<
  Array<{
    plan: Plan;
    presentation: PlanPresentation;
  }>
> {
  const now = new Date();

  const results = await db
    .select({
      plan: plans,
      presentation: planPresentations,
    })
    .from(planPresentations)
    .innerJoin(plans, eq(planPresentations.planId, plans.id))
    .where(and(...publicPresentationConditions(now)))
    .orderBy(desc(planPresentations.publishedAt))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Get every currently public presentation for sitemap generation.
 *
 * The product catalogue intentionally has a page-sized default limit, but a
 * sitemap must not silently omit public products after the first page.
 */
export async function getAllPublishedPlanPresentations(): Promise<
  Array<{
    plan: Plan;
    presentation: PlanPresentation;
  }>
> {
  const now = new Date();

  return db
    .select({
      plan: plans,
      presentation: planPresentations,
    })
    .from(planPresentations)
    .innerJoin(plans, eq(planPresentations.planId, plans.id))
    .where(and(...publicPresentationConditions(now)))
    .orderBy(desc(planPresentations.publishedAt), asc(planPresentations.planId));
}

/**
 * Get presentations by offering type.
 * Useful for type-specific pages or admin filtering.
 *
 * @param offeringType - offering type to filter by
 * @param published - if true, only return published presentations
 * @returns Array of presentations
 */
export async function getPlanPresentationsByType(
  offeringType: OfferingType,
  published: boolean = true
): Promise<
  Array<{
    plan: Plan;
    presentation: PlanPresentation;
  }>
> {
  const now = new Date();

  const whereConditions = [
    eq(planPresentations.offeringType, offeringType),
    ...(published ? publicPresentationConditions(now) : []),
  ];

  const results = await db
    .select({
      plan: plans,
      presentation: planPresentations,
    })
    .from(planPresentations)
    .innerJoin(plans, eq(planPresentations.planId, plans.id))
    .where(and(...whereConditions));

  return results;
}

/**
 * Check if a plan has a presentation.
 * Useful for conditional rendering or access checks.
 *
 * @param planId - Portaly plan ID
 * @returns true if presentation exists, false otherwise
 */
export async function hasPlanPresentation(planId: string): Promise<boolean> {
  const result = await db
    .select({ id: planPresentations.id })
    .from(planPresentations)
    .where(eq(planPresentations.planId, planId))
    .limit(1);

  return result.length > 0;
}

/**
 * Get presentation metadata for a specific offering type.
 * Helps form rendering decide required fields.
 *
 * @param planId - Portaly plan ID
 * @param expectedType - offering type to validate against
 * @returns metadata object or null if missing
 * @throws if presentation exists but type doesn't match
 */
export async function getPlanPresentationMetadata(
  planId: string,
  expectedType: OfferingType
): Promise<Record<string, unknown> | null> {
  const presentation = await getPlanPresentation(planId);

  if (presentation.offeringType !== expectedType) {
    throw new Error(
      `Presentation type mismatch: expected ${expectedType}, got ${presentation.offeringType}`
    );
  }

  return (presentation.metadataJson as Record<string, unknown>) || null;
}
