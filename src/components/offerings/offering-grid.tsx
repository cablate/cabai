"use client";

import { useMemo, useState } from "react";
import { FadeIn } from "@/components/ui/fade-in";
import { OfferingCard } from "./offering-card";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { OfferingType } from "@/lib/validations/plan-presentations";
import type { PublishedCourseStats } from "@/lib/queries/course-catalog";
import { shouldShowOfferingTypeFilters } from "@/lib/product-discovery";
import {
  CalendarBlank,
  DownloadSimple,
  GraduationCap,
  Lightning,
  MonitorPlay,
  SquaresFour,
  UsersThree,
  Wrench,
} from "@phosphor-icons/react";

interface OfferingGridProps {
  items: Array<{
    plan: Plan;
    presentation: PlanPresentation;
    courseStats?: PublishedCourseStats | null;
  }>;
  purchasedPlanIds?: string[];
}

const offeringTypeLabels: Record<OfferingType, string> = {
  course: "線上課程",
  lecture: "線上講座",
  free_event: "免費活動",
  offline_event: "線下活動",
  service: "服務方案",
  membership: "會員訂閱",
  download: "下載資源",
};

const offeringTypeIcons: Record<
  OfferingType,
  typeof GraduationCap
> = {
  course: GraduationCap,
  lecture: MonitorPlay,
  free_event: Lightning,
  offline_event: CalendarBlank,
  service: Wrench,
  membership: UsersThree,
  download: DownloadSimple,
};

const offeringTypeOrder: OfferingType[] = [
  "course",
  "lecture",
  "free_event",
  "offline_event",
  "service",
  "membership",
  "download",
];

export function OfferingGrid({ items, purchasedPlanIds }: OfferingGridProps) {
  const [activeFilter, setActiveFilter] = useState<OfferingType | "all">("all");
  const purchasedSet = useMemo(
    () => new Set(purchasedPlanIds ?? []),
    [purchasedPlanIds],
  );

  const availableTypes = useMemo(() => {
    const types = new Map<OfferingType, number>();
    items.forEach((item) => {
      const type = item.presentation.offeringType as OfferingType;
      types.set(type, (types.get(type) ?? 0) + 1);
    });
    return offeringTypeOrder
      .filter((type) => types.has(type))
      .map((type) => ({ type, count: types.get(type) ?? 0 }));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    return items.filter(
      (item) => item.presentation.offeringType === activeFilter
    );
  }, [items, activeFilter]);
  const showFilters = shouldShowOfferingTypeFilters(
    availableTypes.map(({ type }) => type),
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border-subtle bg-surface py-24">
        <p className="text-sm text-text-muted">目前沒有可瀏覽的內容。</p>
      </div>
    );
  }

  return (
    <section id="offerings" className="pb-16 md:pb-20">
      {showFilters ? (
        <div
          role="group"
          aria-label="內容形式"
          className="mb-6 flex w-full gap-1 overflow-x-auto border-b border-border-subtle pb-2"
        >
            <button
              type="button"
              aria-pressed={activeFilter === "all"}
              onClick={() => setActiveFilter("all")}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-surface-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
            >
              <SquaresFour size={16} weight="duotone" aria-hidden="true" />
              全部
              <span className="font-mono text-[11px] opacity-65">{items.length}</span>
            </button>
            {availableTypes.map(({ type, count }) => {
              const Icon = offeringTypeIcons[type];
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={activeFilter === type}
                  onClick={() => setActiveFilter(type)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-surface-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
                >
                  <Icon size={16} weight="duotone" aria-hidden="true" />
                  {offeringTypeLabels[type]}
                  <span className="font-mono text-[11px] opacity-65">{count}</span>
                </button>
              );
            })}
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-start justify-center rounded-2xl border border-border-subtle bg-surface p-8 shadow-card md:p-10">
          <p className="text-lg font-semibold text-text-primary">這個分類目前沒有內容</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
            先切回全部內容，或稍後再回來看新的課程、活動與資源。
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {filteredItems.map((item, index) => (
            <FadeIn key={item.plan.id} delay={index * 0.08} className="min-w-0">
              <OfferingCard
                plan={item.plan}
                presentation={item.presentation}
                courseStats={item.courseStats}
                alreadyPurchased={purchasedSet.has(item.plan.id)}
                index={index}
              />
            </FadeIn>
          ))}
        </div>
      )}
    </section>
  );
}
