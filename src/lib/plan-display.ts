import { db } from "@/lib/db";
import { plans, planPresentations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Get the human-friendly display name for a plan.
 * Prefers presentation.title (user-customized) over plan.name (Portaly sync).
 */
export function getPlanDisplayName(
  planName: string,
  presentationTitle?: string | null,
): string {
  return presentationTitle || planName;
}

/**
 * Build a Map of planId → display name for batch use.
 * Fetches all plans + presentations in one pass.
 */
export async function buildPlanDisplayNameMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      presentationTitle: planPresentations.title,
    })
    .from(plans)
    .leftJoin(planPresentations, eq(plans.id, planPresentations.planId));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.presentationTitle || row.name);
  }
  return map;
}
