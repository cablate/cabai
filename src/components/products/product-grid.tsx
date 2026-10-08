"use client";

import { ProductCard } from "./product-card";
import { FadeIn } from "@/components/ui/fade-in";
import type { LocalPlan } from "@/lib/plans-local";

export function ProductGrid({
  plans,
  purchasedPlanIds,
}: {
  plans: LocalPlan[];
  purchasedPlanIds?: string[];
}) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-text-muted">目前沒有上架商品</p>
      </div>
    );
  }

  const purchasedSet = new Set(purchasedPlanIds ?? []);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {plans.map((plan, i) => (
        <FadeIn key={plan.id} delay={i * 0.1}>
          <ProductCard
            plan={plan}
            index={i}
            alreadyPurchased={purchasedSet.has(plan.id)}
          />
        </FadeIn>
      ))}
    </div>
  );
}
