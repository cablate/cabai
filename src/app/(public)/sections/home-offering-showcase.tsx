import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  GraduationCap,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { planPath } from "@/lib/plan-url";
import { formatPrice } from "@/lib/utils";
import { HomeSectionBackdrop } from "./home-section-backdrop";

interface OfferingItem {
  plan: Plan;
  presentation: PlanPresentation;
}

function priceLabel(plan: Plan) {
  if (plan.amount === 0) return "免費";
  const price = formatPrice(plan.amount);
  if (plan.billingPeriod === "monthly") return `${price} / 月`;
  if (plan.billingPeriod === "yearly") return `${price} / 年`;
  return price;
}

function offeringTypeLabel(item: OfferingItem) {
  return item.presentation.offeringType === "course" ? "線上課程" : "精選內容";
}

export function HomeOfferingShowcase({
  offerings,
  purchasedPlanIds,
}: {
  offerings: OfferingItem[];
  purchasedPlanIds: string[];
}) {
  if (offerings.length === 0) return null;

  const purchased = new Set(purchasedPlanIds);
  const featured = offerings.find((item) => item.presentation.isFeatured) ?? offerings[0]!;
  const remaining = offerings.filter((item) => item.plan.id !== featured.plan.id).slice(0, 2);
  const featuredPurchased = purchased.has(featured.plan.id);
  const featuredHref = planPath(featured.plan, featuredPurchased ? "my" : "product");

  return (
    <section
      id="products"
      className="home-section-deferred relative isolate overflow-hidden border-b border-border-subtle bg-accent-light/30"
    >
      <HomeSectionBackdrop
        src={PUBLIC_BRANDING.illustration}
        imageClassName="object-[72%_center]"
        className="opacity-[0.12] sm:opacity-[0.18]"
        overlayClassName="bg-[linear-gradient(90deg,rgba(229,243,239,0.98)_0%,rgba(229,243,239,0.9)_54%,rgba(229,243,239,0.68)_100%)]"
      />

      <div className="mx-auto max-w-[90rem] px-5 py-14 sm:px-8 sm:py-18 lg:py-24 xl:px-12">
        <header data-home-reveal className="max-w-3xl">
          <h2 className="font-display text-3xl font-medium leading-tight tracking-[-0.035em] text-text-primary sm:text-4xl md:text-5xl">
            從一門課開始
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">
            把觀念、案例和練習照順序學完，之後也能讓 AI 依權限使用相關內容。
          </p>
        </header>

        <div className="mt-10 grid gap-9 lg:grid-cols-[minmax(0,1.42fr)_minmax(18rem,0.58fr)] lg:gap-12 xl:gap-14">
          <article
            data-home-reveal
            className="relative isolate flex min-h-[25rem] self-start overflow-hidden rounded-2xl bg-ink text-text-inverted shadow-elevated sm:min-h-[28rem]"
          >
            <div className="absolute -inset-y-8 inset-x-0 -z-20">
              <Image
                src={featured.presentation.coverImage || PUBLIC_BRANDING.illustration}
                alt={featured.presentation.title}
                fill
                sizes="(max-width: 1024px) 100vw, 64vw"
                className="object-cover"
              />
            </div>
            <div
              className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(8,31,24,0.2)_0%,rgba(8,31,24,0.7)_48%,rgba(8,31,24,0.98)_100%)]"
              aria-hidden="true"
            />

            <div className="flex w-full flex-col justify-between p-6 sm:p-8 lg:p-10">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-border-inverted bg-surface-elevated/[0.1] text-text-inverted">
                  {offeringTypeLabel(featured)}
                </Badge>
                {featuredPurchased ? (
                  <Badge variant="success">已在會員中心</Badge>
                ) : null}
              </div>

              <div className="max-w-3xl">
                <h3 className="font-display text-3xl font-medium leading-[1.08] tracking-[-0.04em] text-text-inverted sm:text-4xl lg:text-[2.65rem]">
                  {featured.presentation.title}
                </h3>
                <p className="mt-4 line-clamp-2 max-w-2xl text-sm leading-7 text-text-inverted/72 sm:text-base">
                  {featured.presentation.subtitle ||
                    featured.presentation.description ||
                    featured.plan.description ||
                    "查看完整內容、適合對象與取得方式。"}
                </p>
                <div className="mt-7 flex flex-col gap-5 border-t border-border-inverted/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-lg font-semibold text-text-inverted">
                    {priceLabel(featured.plan)}
                  </p>
                  <Button asChild variant="secondary" size="lg">
                    <Link prefetch={false} href={featuredHref}>
                      {featuredPurchased ? "進入內容" : "查看課程"}
                      <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </article>

          <aside data-home-reveal className="flex min-w-0 flex-col">
            <div className="flex items-end justify-between gap-5">
              <h3 className="font-display text-2xl font-medium tracking-[-0.03em] text-text-primary sm:text-3xl">
                更多內容
              </h3>
              <Button asChild variant="ghost" className="shrink-0 px-0 hover:bg-transparent hover:text-accent">
                <Link prefetch={false} href="/products">
                  查看全部
                  <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="mt-5 border-t border-border-strong/70">
              {remaining.length > 0 ? (
                remaining.map((item) => {
                  const alreadyPurchased = purchased.has(item.plan.id);
                  return (
                    <Link prefetch={false}
                      key={item.plan.id}
                      href={planPath(item.plan, alreadyPurchased ? "my" : "product")}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] gap-5 border-b border-border-strong/70 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <GraduationCap size={16} weight="duotone" aria-hidden="true" />
                          <span>{offeringTypeLabel(item)}</span>
                          {alreadyPurchased ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle size={15} weight="fill" aria-hidden="true" />
                              已取得
                            </span>
                          ) : null}
                        </div>
                        <h4 className="mt-3 line-clamp-2 font-display text-lg font-medium leading-snug text-text-primary transition-colors group-hover:text-accent group-focus-visible:text-accent">
                          {item.presentation.title}
                        </h4>
                        <p className="mt-2 line-clamp-1 text-sm leading-6 text-text-secondary">
                          {item.presentation.subtitle || item.plan.description || "查看內容與取得方式。"}
                        </p>
                        <p className="mt-4 font-mono text-sm font-semibold text-text-primary">
                          {priceLabel(item.plan)}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 text-text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-accent group-focus-visible:translate-x-1 group-focus-visible:text-accent" size={19} weight="bold" aria-hidden="true" />
                    </Link>
                  );
                })
              ) : (
                <p className="border-b border-border-strong/70 py-6 text-sm leading-7 text-text-secondary">
                  更多課程與內容上線後，會直接出現在這裡。
                </p>
              )}
            </div>

          </aside>
        </div>
      </div>
    </section>
  );
}
