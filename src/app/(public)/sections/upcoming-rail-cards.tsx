"use client";

import { OfferingCard } from "@/components/offerings/offering-card";
import { FadeIn } from "@/components/ui/fade-in";
import type { Plan, PlanPresentation } from "@/lib/db/schema";

interface UpcomingRailCardsProps {
  items: Array<{ plan: Plan; presentation: PlanPresentation }>;
}

export function UpcomingRailCards({ items }: UpcomingRailCardsProps) {
  return (
    <div className="mt-12 flex gap-5 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-subtle md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
      {items.map((item, i) => (
        <FadeIn
          key={item.plan.id}
          delay={i * 0.1}
          className="w-72 flex-shrink-0 md:w-auto"
        >
          <OfferingCard
            plan={item.plan}
            presentation={item.presentation}
          />
        </FadeIn>
      ))}
    </div>
  );
}
