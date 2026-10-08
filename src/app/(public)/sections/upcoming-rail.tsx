import Link from "next/link";
import { getPublishedPlanPresentations } from "@/lib/plan-presentations";
import { FadeIn } from "@/components/ui/fade-in";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { UpcomingRailCards } from "./upcoming-rail-cards";

const TIME_SENSITIVE_TYPES = new Set([
  "lecture",
  "free_event",
  "offline_event",
]);

export async function UpcomingRailSection() {
  const allItems = await getPublishedPlanPresentations();
  const upcomingItems = allItems.filter((item) =>
    TIME_SENSITIVE_TYPES.has(item.presentation.offeringType)
  );

  if (upcomingItems.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:px-8">
      <FadeIn>
        <div className="flex items-end justify-between">
          <div>
            <span className="font-mono text-xs text-text-muted">
              UPCOMING
            </span>
            <h2 className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
              近期活動與講座
            </h2>
          </div>
          <Link prefetch={false}
            href="/products"
            className="hidden items-center gap-2 rounded-sm text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:inline-flex"
          >
            查看全部
            <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </FadeIn>

      <UpcomingRailCards items={upcomingItems.slice(0, 6)} />

      <Link prefetch={false}
        href="/products"
        className="mt-8 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:hidden"
      >
        查看全部
        <ArrowRight size={16} weight="bold" />
      </Link>
    </section>
  );
}
