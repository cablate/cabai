import { db } from "@/lib/db";
import { plans, planPresentations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPlanDeliveryStatus, getPlanDeliveryStatuses, type PlanDeliveryStatus } from "@/lib/plan-delivery-status";
import type { Plan, PlanPresentation } from "@/lib/db/schema";

export interface PlanWithStatuses {
  plan: Plan;
  presentation: PlanPresentation | null;
  deliveryStatus: PlanDeliveryStatus;
}

/**
 * Fetch all plans with their presentation and delivery status.
 * Returns combined array sorted by plan name.
 */
export async function getPlansWithStatuses(): Promise<PlanWithStatuses[]> {
  // Query all plans with their presentations (left join)
  const results = await db
    .select({
      plan: plans,
      presentation: planPresentations,
    })
    .from(plans)
    .leftJoin(
      planPresentations,
      eq(plans.id, planPresentations.planId)
    )
    .orderBy(desc(plans.syncedAt));

  // Batch-fetch delivery statuses (parallel, not sequential N+1)
  const planIds = results.map(({ plan }) => plan.id);
  const statusMap = await getPlanDeliveryStatuses(planIds);

  const plansWithStatuses: PlanWithStatuses[] = results.map(({ plan, presentation }) => ({
    plan,
    presentation: presentation || null,
    deliveryStatus: statusMap[plan.id] ?? {
      hasPresentation: false, presentationPublished: false,
      hasCourses: false, hasPlanContents: false, hasServiceConfigs: false,
      canDeliver: false, isFullySetup: false, missingSetup: ["presentation", "delivery_method"],
    },
  }));

  // Sort by plan name
  plansWithStatuses.sort((a, b) => a.plan.name.localeCompare(b.plan.name));

  return plansWithStatuses;
}

/**
 * Fetch single plan with presentation and delivery status.
 * Throws if plan not found.
 */
export async function getPlanWithStatuses(planId: string): Promise<PlanWithStatuses> {
  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (planResult.length === 0) {
    throw new Error(`Plan ${planId} not found`);
  }

  const plan = planResult[0]!;

  // Get presentation (optional)
  const presentationResult = await db
    .select()
    .from(planPresentations)
    .where(eq(planPresentations.planId, planId))
    .limit(1);

  const presentation = presentationResult.length > 0 ? presentationResult[0]! : null;

  // Get delivery status
  const deliveryStatus = await getPlanDeliveryStatus(planId);

  return {
    plan,
    presentation,
    deliveryStatus,
  };
}
