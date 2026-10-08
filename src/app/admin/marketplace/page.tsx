import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  plans,
  planPresentations,
  portalyMarketplaceEvents,
  portalyProductMappings,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { MarketplaceManager } from "./marketplace-manager";
import { getPlanDisplayName } from "@/lib/plan-display";

export default async function MarketplacePage() {
  const mappings = await db
    .select({
      id: portalyProductMappings.id,
      portalyProductId: portalyProductMappings.portalyProductId,
      planId: portalyProductMappings.planId,
      planName: plans.name,
      presentationTitle: planPresentations.title,
      productName: portalyProductMappings.productName,
      createdAt: portalyProductMappings.createdAt,
    })
    .from(portalyProductMappings)
    .leftJoin(plans, eq(portalyProductMappings.planId, plans.id))
    .leftJoin(planPresentations, eq(portalyProductMappings.planId, planPresentations.planId))
    .orderBy(desc(portalyProductMappings.createdAt));

  const events = await db
    .select({
      id: portalyMarketplaceEvents.id,
      portalyOrderId: portalyMarketplaceEvents.portalyOrderId,
      portalyProductId: portalyMarketplaceEvents.portalyProductId,
      event: portalyMarketplaceEvents.event,
      customerEmail: portalyMarketplaceEvents.customerEmail,
      customerName: portalyMarketplaceEvents.customerName,
      amount: portalyMarketplaceEvents.amount,
      currency: portalyMarketplaceEvents.currency,
      status: portalyMarketplaceEvents.status,
      error: portalyMarketplaceEvents.error,
      createdAt: portalyMarketplaceEvents.createdAt,
      processedAt: portalyMarketplaceEvents.processedAt,
    })
    .from(portalyMarketplaceEvents)
    .orderBy(desc(portalyMarketplaceEvents.createdAt))
    .limit(100);

  const pendingGroups = await db
    .select({
      portalyProductId: portalyMarketplaceEvents.portalyProductId,
      count: sql<number>`count(*)::int`,
    })
    .from(portalyMarketplaceEvents)
    .where(eq(portalyMarketplaceEvents.status, "pending_mapping"))
    .groupBy(portalyMarketplaceEvents.portalyProductId);

  const distinctProducts = await db
    .select({
      portalyProductId: portalyMarketplaceEvents.portalyProductId,
      eventCount: sql<number>`count(*)::int`,
      latestEmail: sql<string>`max(${portalyMarketplaceEvents.customerEmail})`,
    })
    .from(portalyMarketplaceEvents)
    .groupBy(portalyMarketplaceEvents.portalyProductId)
    .orderBy(desc(sql`count(*)`));

  const mappedProductIds = new Set(mappings.map((m) => m.portalyProductId));
  const productOptions = distinctProducts.map((p) => ({
    portalyProductId: p.portalyProductId,
    eventCount: p.eventCount,
    latestEmail: p.latestEmail,
    isMapped: mappedProductIds.has(p.portalyProductId),
  }));

  const activePlansRaw = await db
    .select({
      id: plans.id,
      name: plans.name,
      status: plans.status,
      presentationTitle: planPresentations.title,
    })
    .from(plans)
    .leftJoin(planPresentations, eq(plans.id, planPresentations.planId))
    .where(eq(plans.status, "active"))
    .orderBy(plans.name);

  const importPlansRaw = await db
    .select({
      id: plans.id,
      name: plans.name,
      status: plans.status,
      presentationTitle: planPresentations.title,
    })
    .from(plans)
    .leftJoin(planPresentations, eq(plans.id, planPresentations.planId))
    .orderBy(plans.name);

  const activePlans = activePlansRaw.map((p) => ({
    id: p.id,
    name: getPlanDisplayName(p.name, p.presentationTitle),
    status: p.status,
  }));

  const importPlans = importPlansRaw.map((p) => ({
    id: p.id,
    name: getPlanDisplayName(p.name, p.presentationTitle),
    status: p.status,
  }));

  const serializedMappings = mappings.map((m) => ({
    ...m,
    planName: getPlanDisplayName(m.planName || "Unknown", m.presentationTitle),
    createdAt: m.createdAt.toISOString(),
  }));

  const serializedEvents = events.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    processedAt: e.processedAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Portaly 商城"
        description="管理 Portaly 商品 mapping、webhook event，以及歷史購買紀錄匯入。"
      />
      <MarketplaceManager
        mappings={serializedMappings}
        events={serializedEvents}
        plans={activePlans}
        importPlans={importPlans}
        pendingGroups={pendingGroups}
        productOptions={productOptions}
      />
    </div>
  );
}
