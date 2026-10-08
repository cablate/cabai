/**
 * Course-level access check with grandfather protection.
 *
 * A user has access to a course if:
 * 1. The course is actively linked to a Plan they purchased (planCourses.removedAt IS NULL), OR
 * 2. The course was removed from a Plan (removedAt IS NOT NULL) but the user
 *    purchased that Plan BEFORE the removal date (grandfather protection).
 */

import { db } from "@/lib/db";
import { orders, planCourses, userPurchases, users } from "@/lib/db/schema";
import { eq, and, inArray, isNull, lt } from "drizzle-orm";
import { checkPlanAccess, localPaymentOrderGrantsAccess } from "@/lib/access";

/**
 * Get all planIds that give a user access to a specific course,
 * including grandfathered plans.
 */
export async function getAccessiblePlanIdsForCourse(
  courseId: string,
  userId: string,
  userEmail?: string | null,
): Promise<{ planId: string; grandfathered: boolean }[]> {
  // Get all mappings (active + removed)
  const allMappings = await db
    .select({
      planId: planCourses.planId,
      removedAt: planCourses.removedAt,
    })
    .from(planCourses)
    .where(eq(planCourses.courseId, courseId));

  const result: { planId: string; grandfathered: boolean }[] = [];

  for (const mapping of allMappings) {
    if (!mapping.removedAt) {
      // Active mapping — check normal access
      const access = await checkPlanAccess(userId, mapping.planId, userEmail);
      if (access.hasAccess) {
        result.push({ planId: mapping.planId, grandfathered: false });
      }
    } else {
      // Removed mapping — grandfather protection requires BOTH:
      //   1. a non-revoked purchase that predates the course's removal, AND
      //   2. that access to the plan is STILL valid today.
      // M-1: previously only (1) was checked. An expired manual/free grant, or
      // a lapsed/cancelled subscription whose revoke callback never landed,
      // could therefore resurrect a removed course — even though the exact same
      // access is denied on an active mapping (which runs the full
      // checkPlanAccess below). Re-run that validity check here so removed and
      // active mappings agree on "is this access still live?".
      const purchasedBeforeRemoval = await db.query.userPurchases.findFirst({
        where: and(
          eq(userPurchases.userId, userId),
          eq(userPurchases.planId, mapping.planId),
          isNull(userPurchases.revokedAt),
          lt(userPurchases.grantedAt, mapping.removedAt),
        ),
        columns: { id: true },
      });
      if (purchasedBeforeRemoval) {
        const access = await checkPlanAccess(userId, mapping.planId, userEmail);
        if (access.hasAccess) {
          result.push({ planId: mapping.planId, grandfathered: true });
        }
      }
    }
  }

  return result;
}

/**
 * Check if a user has access to a specific course (including grandfather).
 * Returns the first accessible planId for navigation purposes.
 */
export async function checkCourseAccess(
  courseId: string,
  userId: string,
  userEmail?: string | null,
  userRole?: string,
): Promise<{ hasAccess: boolean; planId: string }> {
  // Admin bypass is DB-authoritative; session/JWT role can be stale.
  if (userRole === "admin") {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    if (dbUser?.role === "admin") return { hasAccess: true, planId: "" };
  }

  const accessible = await getAccessiblePlanIdsForCourse(courseId, userId, userEmail);
  if (accessible.length > 0) {
    // Prefer non-grandfathered plan for navigation
    const active = accessible.find((a) => !a.grandfathered);
    return {
      hasAccess: true,
      planId: active?.planId ?? accessible[0]!.planId,
    };
  }

  // No access — find any linked plan for redirect
  const anyMapping = await db.query.planCourses.findFirst({
    where: and(eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)),
  });

  return { hasAccess: false, planId: anyMapping?.planId ?? "" };
}

/**
 * Batch, local-only equivalent of `checkCourseAccess(courseId, userId)` when
 * no email or role override is supplied. Admin Information statistics use it
 * to avoid N+1 queries and to guarantee a read-only aggregate never invokes
 * Portaly self-heal or any other external side effect.
 */
export async function listLocallyEligibleUserIdsForCourse(
  courseId: string,
  now = new Date(),
): Promise<string[]> {
  const mappings = await db.select({
    planId: planCourses.planId,
    removedAt: planCourses.removedAt,
  }).from(planCourses).where(eq(planCourses.courseId, courseId));
  if (mappings.length === 0) return [];

  const planIds = [...new Set(mappings.map((mapping) => mapping.planId))];
  const purchases = await db.select({
    userId: userPurchases.userId,
    planId: userPurchases.planId,
    orderId: userPurchases.orderId,
    grantedAt: userPurchases.grantedAt,
    grantedBy: userPurchases.grantedBy,
    expiresAt: userPurchases.expiresAt,
  }).from(userPurchases).where(and(
    inArray(userPurchases.planId, planIds),
    isNull(userPurchases.revokedAt),
  ));
  if (purchases.length === 0) return [];

  const orderIds = purchases
    .map((purchase) => purchase.orderId)
    .filter((orderId): orderId is string => Boolean(orderId));
  const orderRows = orderIds.length > 0
    ? await db.select({
        id: orders.id,
        status: orders.status,
        subscriptionStatus: orders.subscriptionStatus,
        cancelAtPeriodEnd: orders.cancelAtPeriodEnd,
        cancelEffectiveAt: orders.cancelEffectiveAt,
        nextBillingAt: orders.nextBillingAt,
        createdAt: orders.createdAt,
      }).from(orders).where(inArray(orders.id, orderIds))
    : [];
  const ordersById = new Map(orderRows.map((order) => [order.id, order]));
  const mappingsByPlan = new Map<string, typeof mappings>();
  for (const mapping of mappings) {
    mappingsByPlan.set(mapping.planId, [...(mappingsByPlan.get(mapping.planId) ?? []), mapping]);
  }

  const eligible = new Set<string>();
  for (const purchase of purchases) {
    const live = purchase.grantedBy === "manual" || purchase.grantedBy === "free_claim" || !purchase.orderId
      ? !purchase.expiresAt || purchase.expiresAt >= now
      : (() => {
          const order = ordersById.get(purchase.orderId!);
          return Boolean(order && localPaymentOrderGrantsAccess(order, purchase.expiresAt, now));
        })();
    if (!live) continue;

    const grantsCourse = (mappingsByPlan.get(purchase.planId) ?? []).some((mapping) => (
      mapping.removedAt === null || purchase.grantedAt < mapping.removedAt
    ));
    if (grantsCourse) eligible.add(purchase.userId);
  }
  return [...eligible];
}
