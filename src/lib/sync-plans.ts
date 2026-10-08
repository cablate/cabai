import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { getPlans } from "@/lib/portaly";
import { sql } from "drizzle-orm";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";

export async function syncPlans(): Promise<{ synced: number; error?: string }> {
  const { data: portalyPlans, error } = await getPlans();
  if (error || !portalyPlans) return { synced: 0, error: error ?? "No data" };

  for (const p of portalyPlans) {
    await db.insert(plans).values({
      id: p.id,
      providerPlanId: p.id,
      name: p.name,
      description: p.description ?? null,
      amount: p.amount,
      currency: p.currency,
      billingPeriod: p.billingPeriod,
      pricingType: p.pricingType ?? null,
      status: p.status,
      image: p.image ?? null,
      merchantPlanId: p.merchantPlanId ?? null,
      gateway: "portaly",
      portalyCreatedAt: p.createdAt,
      portalyUpdatedAt: p.updatedAt,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: plans.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        amount: sql`excluded.amount`,
        currency: sql`excluded.currency`,
        billingPeriod: sql`excluded.billing_period`,
        pricingType: sql`excluded.pricing_type`,
        status: sql`excluded.status`,
        image: sql`excluded.image`,
        merchantPlanId: sql`excluded.merchant_plan_id`,
        providerPlanId: sql`excluded.provider_plan_id`,
        portalyCreatedAt: sql`excluded.portaly_created_at`,
        portalyUpdatedAt: sql`excluded.portaly_updated_at`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
  }

  expirePublicSiteCache("plans");
  return { synced: portalyPlans.length };
}
