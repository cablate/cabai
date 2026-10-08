import Link from "next/link";
import { getPublishedPlanPresentations } from "@/lib/plan-presentations";
import { FadeIn } from "@/components/ui/fade-in";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { FreeResourcesCards } from "./free-resources-cards";

const FREE_TYPES = new Set(["free_event", "download"]);

export async function FreeResourcesSection() {
  const allItems = await getPublishedPlanPresentations();
  const freeItems = allItems.filter(
    (item) =>
      FREE_TYPES.has(item.presentation.offeringType) ||
      item.plan.amount === 0
  );

  if (freeItems.length === 0) return null;

  return (
    <section className="border-y border-border-subtle bg-surface-hover">
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-8">
        <FadeIn>
          <div className="flex items-end justify-between">
            <div>
              <span className="font-mono text-xs text-text-muted">
                FREE RESOURCES
              </span>
              <h2 className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
                免費資源
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-text-secondary">
                還沒準備購買？先從免費內容開始，無需付費即可體驗。
              </p>
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

        <FreeResourcesCards items={freeItems.slice(0, 6)} />
      </div>
    </section>
  );
}
