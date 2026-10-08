import { db } from "@/lib/db";
import {
  planPresentations,
  planCourses,
  planContents,
  serviceConfigs,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Delivery completeness status for a plan.
 * Computed dynamically from existing tables.
 * Used by admin Plans table and detail view.
 */
export interface PlanDeliveryStatus {
  // Presentation setup
  hasPresentation: boolean;
  presentationPublished: boolean;

  // Delivery options (at least one must be true to deliver)
  hasCourses: boolean;
  hasPlanContents: boolean;
  hasServiceConfigs: boolean;

  // Computed completeness
  canDeliver: boolean; // has at least one delivery method
  isFullySetup: boolean; // presentation + at least one delivery

  // Missing items for admin guidance
  missingSetup: string[]; // e.g., ["presentation", "delivery method"]
}

/**
 * Compute delivery status for a plan.
 * Called by admin Plans table, detail page, and system health check.
 *
 * @param planId - Portaly plan ID
 * @returns PlanDeliveryStatus
 */
export async function getPlanDeliveryStatus(
  planId: string
): Promise<PlanDeliveryStatus> {
  // Query all related data
  const presentationResult = await db
    .select()
    .from(planPresentations)
    .where(eq(planPresentations.planId, planId))
    .limit(1);

  const courseResult = await db
    .select()
    .from(planCourses)
    .where(and(eq(planCourses.planId, planId), isNull(planCourses.removedAt)))
    .limit(1);

  const contentResult = await db
    .select()
    .from(planContents)
    .where(and(eq(planContents.planId, planId), isNull(planContents.deletedAt)))
    .limit(1);

  const serviceResult = await db
    .select()
    .from(serviceConfigs)
    .where(
      and(
        eq(serviceConfigs.planId, planId),
        eq(serviceConfigs.isActive, true),
        isNull(serviceConfigs.deletedAt),
      ),
    )
    .limit(1);

  const hasPresentation = presentationResult.length > 0;
  const presentation = hasPresentation ? presentationResult[0] : null;

  // Determine delivery methods
  const hasCourses = courseResult.length > 0;
  const hasPlanContents = contentResult.length > 0;
  const hasServiceConfigs = serviceResult.length > 0;

  // Compute completeness
  const canDeliver =
    hasCourses ||
    hasPlanContents ||
    hasServiceConfigs;

  const presentationPublished =
    hasPresentation && presentation!.publishedAt !== null;

  const isFullySetup = presentationPublished && canDeliver;

  // Build missing setup items
  const missingSetup: string[] = [];
  if (!hasPresentation) {
    missingSetup.push("presentation");
  } else if (!presentationPublished) {
    missingSetup.push("presentation_not_published");
  }

  if (!canDeliver) {
    missingSetup.push("delivery_method");
  }

  return {
    hasPresentation,
    presentationPublished,
    hasCourses,
    hasPlanContents,
    hasServiceConfigs,
    canDeliver,
    isFullySetup,
    missingSetup,
  };
}

/**
 * Batch query delivery status for multiple plans.
 * Used by Plans table to show status for all plans at once.
 *
 * @param planIds - array of Portaly plan IDs
 * @returns map of planId -> PlanDeliveryStatus
 */
export async function getPlanDeliveryStatuses(
  planIds: string[]
): Promise<Record<string, PlanDeliveryStatus>> {
  if (planIds.length === 0) {
    return {};
  }

  const results: Record<string, PlanDeliveryStatus> = {};

  // Parallel fetch for better performance
  await Promise.all(
    planIds.map(async (planId) => {
      results[planId] = await getPlanDeliveryStatus(planId);
    })
  );

  return results;
}

/**
 * Get completeness percentage for a plan.
 * Useful for progress bars or visual indicators.
 *
 * @param status - PlanDeliveryStatus
 * @returns 0-100 percentage
 */
export function getCompletenessPercentage(status: PlanDeliveryStatus): number {
  const checks = [
    status.hasPresentation ? 1 : 0,
    status.presentationPublished ? 1 : 0,
    status.canDeliver ? 1 : 0,
  ];

  const completed = checks.filter((x) => x === 1).length;
  const total = checks.length;

  return Math.round((completed / total) * 100);
}
