import type { Metadata } from "next";
import { getPublishedPlanPresentations } from "@/lib/plan-presentations";
import { OfferingGrid } from "@/components/offerings/offering-grid";
import { createLogger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { getEntitledPlanIds } from "@/lib/access";
import { breadcrumbListSchema, serializeJsonLd } from "@/lib/seo/json-ld";
import { BRAND_NAME } from "@/lib/constants";
import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { getPublishedCourseStatsForPlan } from "@/lib/queries/course-catalog";
import { ProductStartGuide } from "@/components/offerings/product-start-guide";
import { loadPublicProductCatalog } from "@/lib/public-product-catalog";

const logger = createLogger("products-page");
const siteName = BRAND_NAME;
const defaultOgImage = PUBLIC_BRANDING.socialImage;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Agent、Claude Code 與 Vibe Coding 課程",
  description:
    "瀏覽 AgentSkill 線上課程、Claude Code 工程手冊、AI 協作免費資源、講座與服務方案，找到適合你的內容。",
  alternates: { canonical: "/products" },
  openGraph: {
    title: `AI Agent、Claude Code 與 Vibe Coding 課程 | ${siteName}`,
    description:
      "瀏覽 AgentSkill 線上課程、Claude Code 工程手冊、AI 協作免費資源、講座與服務方案。",
    url: "/products",
    type: "website",
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `AI Agent、Claude Code 與 Vibe Coding 課程 | ${siteName}`,
    description:
      "瀏覽 AgentSkill 線上課程、Claude Code 工程手冊、AI 協作免費資源、講座與服務方案。",
    images: [defaultOgImage],
  },
};

function ProductsHero({ count }: { count: number }) {
  return (
    <header className="pb-5 pt-7 sm:pb-6 sm:pt-9">
      <div className="border-b border-border pb-6 sm:pb-7">
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-accent shadow-card">
            <Compass size={18} weight="duotone" aria-hidden="true" />
          </span>
          <span>課程與內容</span>
          <span aria-hidden="true">·</span>
          <span>{count} 項公開內容</span>
        </div>
        <h1 className="mt-5 max-w-3xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl md:text-5xl">
          找到適合你的課程與內容
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base sm:leading-7">
          從免費資源開始，或選擇一套完整課程，把方法帶進實際工作。
        </p>
      </div>
    </header>
  );
}

export default async function ProductsPage() {
  const catalog = await loadPublicProductCatalog(
    getPublishedPlanPresentations,
  );
  if (catalog.state === "error") {
    logger.error("Failed to fetch published product presentations", {
      error: String(catalog.error),
    });
  }
  const presentations = catalog.items;

  const session = await auth();
  const purchasedPlanIds = session?.user?.id
    ? Array.from(await getEntitledPlanIds(session.user.id))
    : [];

  // BreadcrumbList JSON-LD
  const breadcrumbData = breadcrumbListSchema([
    { name: siteName, url: "/" },
    { name: "探索全部", url: "/products" },
  ]);

  const items = await Promise.all(
    presentations.map(async (item) => ({
      ...item,
      courseStats:
        item.presentation.offeringType === "course"
          ? await getPublishedCourseStatsForPlan(item.plan.id)
          : null,
    })),
  );

  return (
    <section className="min-h-screen overflow-x-hidden bg-surface-hover">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbData) }}
      />
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <ProductsHero count={presentations.length} />
        <ProductStartGuide />
        <OfferingGrid items={items} purchasedPlanIds={purchasedPlanIds} />
      </div>
    </section>
  );
}
