"use client";

import { OfferingCard } from "@/components/offerings/offering-card";
import { FadeIn } from "@/components/ui/fade-in";
import type { Plan, PlanPresentation } from "@/lib/db/schema";

interface FreeResourcesCardsProps {
  items: Array<{ plan: Plan; presentation: PlanPresentation }>;
}

export function FreeResourcesCards({ items }: FreeResourcesCardsProps) {
  return (
    <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <FadeIn key={item.plan.id} delay={i * 0.1}>
          <OfferingCard
            plan={item.plan}
            presentation={item.presentation}
          />
        </FadeIn>
      ))}
    </div>
  );
}
