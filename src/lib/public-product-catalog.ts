import type { Plan, PlanPresentation } from "@/lib/db/schema";

export type PublicProductCatalogItem = {
  plan: Plan;
  presentation: PlanPresentation;
};

export type PublicProductCatalogLoad =
  | {
      state: "ready" | "empty";
      items: PublicProductCatalogItem[];
    }
  | {
      state: "error";
      items: [];
      error: unknown;
    };

/**
 * Load the Products catalogue without falling back to plan-only data.
 * A missing or failed published-presentation query must remain fail-closed.
 */
export async function loadPublicProductCatalog(
  query: () => Promise<PublicProductCatalogItem[]>,
): Promise<PublicProductCatalogLoad> {
  try {
    const items = await query();
    return {
      state: items.length === 0 ? "empty" : "ready",
      items,
    };
  } catch (error) {
    return { state: "error", items: [], error };
  }
}
