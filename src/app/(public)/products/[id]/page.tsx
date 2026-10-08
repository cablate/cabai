import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPlanAccess } from "@/lib/access";
import { resolvePlanByIdOrSlug } from "@/lib/plans-local";
import { planPath } from "@/lib/plan-url";
import Image from "next/image";
import Link from "next/link";
import { FadeIn } from "@/components/ui/fade-in";
import { Badge } from "@/components/ui/badge";
import { TrackAction } from "@/components/track-action";
import { cn, formatPrice } from "@/lib/utils";
import { db } from "@/lib/db";
import { courses, planCourses, lessons, userProgress } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import { getPublishedCourseSyllabusForPlan } from "@/lib/queries/course-catalog";
import { recordEvent } from "@/lib/event-tracking";
import {
  getPlanWithPresentation,
  isPublicPlanPresentation,
} from "@/lib/plan-presentations";
import { OfferingDetailSections } from "@/components/offerings/offering-detail-sections";
import { TrustBlock } from "@/components/offerings/trust-block";
import { Markdown } from "@/components/ui/markdown";
import { CommonSalesSections } from "@/components/offerings/common-sales-sections";
import { BRAND_NAME } from "@/lib/constants";
import {
  ArrowUpRight,
  ArrowLeft,
  Article,
  BookOpen,
  CheckCircle,
  FilePdf,
  VideoCamera,
  DownloadSimple,
  Plugs,
} from "@phosphor-icons/react/dist/ssr";
import type { OfferingType, TrustBlock as TrustBlockType, TestimonialItem } from "@/lib/validations/plan-presentations";
import { productSchema, courseSchema, breadcrumbListSchema, serializeJsonLd } from "@/lib/seo/json-ld";
import { normalizeAttribution } from "@/lib/attribution";
import type { Attribution } from "@/lib/attribution";
import {
  getBillingLabel,
  getTrustSectionTitle,
} from "@/lib/public-offering-copy";

export const dynamic = "force-dynamic";
const siteName = BRAND_NAME;
const defaultOgImage = "/oss/social.png";
const unavailableProductMetadata: Metadata = {
  title: "商品不存在",
  robots: { index: false, follow: false },
};

interface ProductPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id: idOrSlug } = await params;
  const resolved = await resolvePlanByIdOrSlug(idOrSlug);
  if (!resolved) return unavailableProductMetadata;
  const id = resolved.id;

  try {
    const { plan, presentation } = await getPlanWithPresentation(id);
    if (!isPublicPlanPresentation(plan, presentation)) {
      return unavailableProductMetadata;
    }

    // Use presentation data if available, fall back to plan
    const title = presentation?.title || plan.name;
    const description = presentation?.subtitle || plan.description || `${plan.name} — 由 ${siteName} 製作的內容與服務`;
    const image = presentation?.coverImage || plan.image;
    const canonical = planPath(plan, "product");
    const ogImages = image
      ? [{ url: image, alt: title }]
      : [
          {
            url: defaultOgImage,
            width: 1200,
            height: 630,
            alt: siteName,
          },
        ];

    // Append offering type label for SEO keyword enrichment
    const { offeringType } = presentation!;
    const typeLabel = offeringType ? offeringTypeLabels[offeringType] : undefined;
    const seoDescription = typeLabel
      ? `${title} — ${typeLabel}。${description}`
      : description;

    return {
      title,
      description: seoDescription,
      alternates: { canonical },
      openGraph: {
        title,
        description: seoDescription,
        url: canonical,
        images: ogImages,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: seoDescription,
        images: [image || defaultOgImage],
      },
    };
  } catch {
    return unavailableProductMetadata;
  }
}

function withQueryString(
  path: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

const contentTypeConfig = {
  video: { label: "影片", Icon: VideoCamera },
  pdf: { label: "PDF", Icon: FilePdf },
  text: { label: "文章", Icon: Article },
  download: { label: "下載", Icon: DownloadSimple },
} as const;

const offeringTypeLabels: Record<OfferingType, string> = {
  course: "線上課程",
  lecture: "線上講座",
  free_event: "免費活動",
  offline_event: "線下活動",
  service: "服務方案",
  membership: "會員訂閱",
  download: "下載資源",
};

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

const purchaseActionClass = "group flex w-full items-center justify-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-text-inverted transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-inverse-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]";

function PurchaseAction({
  planId,
  ctaText,
  ctaHref,
  ctaDisabled,
  isExternalCheckout,
  ctaNewTab,
  showFreeClaimForm,
  attribution,
  className,
  ariaLabel,
}: {
  planId: string;
  ctaText: string;
  ctaHref: string;
  ctaDisabled: boolean;
  isExternalCheckout: boolean;
  ctaNewTab: boolean;
  showFreeClaimForm: boolean;
  attribution: Attribution;
  className?: string;
  ariaLabel?: string;
}) {
  if (ctaDisabled) {
    return <div aria-label={ariaLabel} className={cn("flex w-full items-center justify-center rounded-xl bg-surface-muted px-4 py-3 text-sm font-semibold text-text-muted", className)}>{ctaText}</div>;
  }

  const content = (
    <>
      <span>{ctaText}</span>
      <span className="flex size-5 items-center justify-center rounded bg-surface-elevated/10 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px">
        <ArrowUpRight weight="bold" className="size-3.5" aria-hidden="true" />
      </span>
    </>
  );

  if (isExternalCheckout) {
    return (
      <TrackAction eventType="product_cta_clicked" properties={{ planId, type: "external", ...attribution }}>
        <a aria-label={ariaLabel} href={ctaHref} target={ctaNewTab ? "_blank" : "_self"} rel="noopener noreferrer" className={cn(purchaseActionClass, className)}>{content}</a>
      </TrackAction>
    );
  }

  if (showFreeClaimForm) {
    return (
      <form action="/api/checkout/free-claim" method="POST" className={className}>
        <input type="hidden" name="planId" value={planId} />
        <button type="submit" aria-label={ariaLabel} className={purchaseActionClass}>{content}</button>
      </form>
    );
  }

  return (
    <TrackAction eventType="product_cta_clicked" properties={{ planId, type: "internal", ...attribution }}>
      <Link href={ctaHref} prefetch={false} aria-label={ariaLabel} className={cn(purchaseActionClass, className)}>{content}</Link>
    </TrackAction>
  );
}

function PurchaseNote({
  isExternalCheckout,
  ctaDisabled,
  isFreeClaim,
  email,
  loginHref,
}: {
  isExternalCheckout: boolean;
  ctaDisabled: boolean;
  isFreeClaim: boolean;
  email?: string | null;
  loginHref: string;
}) {
  if (isExternalCheckout && !ctaDisabled) {
    return email ? (
      <p className="rounded-lg bg-warning-light px-3 py-2 text-[0.7rem] leading-5 text-warning ring-1 ring-warning/15">
        結帳請使用 <span className="font-mono font-semibold">{email}</span>，才能自動開通本站權益。
      </p>
    ) : (
      <p className="rounded-lg bg-warning-light px-3 py-2 text-[0.7rem] leading-5 text-warning ring-1 ring-warning/15">
        建議先<Link prefetch={false} href={loginHref} className="rounded-sm font-semibold underline underline-offset-2 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">登入</Link>，並使用同一個 email 結帳，才能自動開通權益。
      </p>
    );
  }

  return (
    <p className="text-[0.7rem] leading-5 text-text-muted">
      {ctaDisabled ? "此項內容目前已停售。" : isFreeClaim ? "登入後免費加入，之後可在會員中心繼續使用。" : "付款完成後，內容會出現在會員中心。"}
    </p>
  );
}

function ProductHeroArtwork({ image, title, typeLabel }: { image?: string | null; title: string; typeLabel: string }) {
  return (
    <div className="relative min-h-[22rem] overflow-hidden rounded-2xl bg-ink shadow-elevated sm:min-h-[28rem] xl:min-h-[34rem]">
      {image ? (
        <>
          <Image src={image} alt={title} fill className="object-cover" priority sizes="(max-width: 1279px) 100vw, 44vw" />
          <div className="absolute inset-0 bg-ink/22" />
        </>
      ) : (
        <>
          <span className="absolute -bottom-10 -right-8 font-display text-[13rem] font-medium leading-none tracking-[-0.12em] text-text-inverted/[0.045]" aria-hidden="true">AI</span>
          <span className="absolute -right-16 top-1/2 size-72 -translate-y-1/2 rotate-45 border border-border-inverted" aria-hidden="true" />
          <span className="absolute right-2 top-1/2 size-40 -translate-y-1/2 rotate-45 border border-border-inverted" aria-hidden="true" />
        </>
      )}
      <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-inverted/42">CabAI learning object</p>
        <div>
          <BookOpen size={30} weight="duotone" className="text-amber-soft" aria-hidden="true" />
          <p className="mt-4 font-display text-2xl font-medium tracking-[-0.03em] text-text-inverted">{typeLabel}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-inverted/54">閱讀完整介紹、內容結構與取得方式後，再決定是否加入。</p>
        </div>
      </div>
    </div>
  );
}

function hasList(metadata: Record<string, unknown> | null, key: string): boolean {
  return (
    Array.isArray(metadata?.[key]) &&
    (metadata?.[key] as string[]).some((item) => item.trim().length > 0)
  );
}

function hasStructuredSalesSections(
  metadata: Record<string, unknown> | null
): boolean {
  if (!metadata) return false;
  const instructor = metadata.instructor as
    | { name?: string; bio?: string }
    | undefined;
  return (
    hasList(metadata, "audienceItems") ||
    hasList(metadata, "painPoints") ||
    hasList(metadata, "notForItems") ||
    hasList(metadata, "learningObjectives") ||
    hasList(metadata, "includedItems") ||
    hasList(metadata, "outcomes") ||
    hasList(metadata, "prerequisites") ||
    typeof metadata.firstWeekPlan === "string" ||
    typeof metadata.vsFreeContent === "string" ||
    Boolean(instructor?.name || instructor?.bio) ||
    (Array.isArray(metadata.faqItems) && metadata.faqItems.length > 0) ||
    (Array.isArray(metadata.testimonials) && metadata.testimonials.length > 0)
  );
}

function ProductSectionNav({
  hasSales,
  alreadyPurchased,
  isFreeAccess,
}: {
  hasSales: boolean;
  alreadyPurchased: boolean;
  isFreeAccess: boolean;
}) {
  const links = [
    { href: "#overview", label: "介紹" },
    ...(!alreadyPurchased && hasSales ? [{ href: "#fit", label: "適合你嗎" }] : []),
    { href: "#content", label: "內容" },
    ...(!alreadyPurchased
      ? [{ href: "#trust", label: isFreeAccess ? "說明" : "保障" }]
      : []),
  ];

  return (
    <nav className="sticky top-[var(--site-header-height)] z-20 mb-8 border-y border-border-subtle bg-surface/92 backdrop-blur-md sm:mb-12">
      <div className="flex snap-x snap-mandatory gap-7 overflow-x-auto overscroll-x-contain text-sm text-text-muted">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 shrink-0 snap-start items-center rounded-sm font-medium transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { id: idOrSlug } = await params;
  const query = await searchParams;
  const attributionParams = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const value = query[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) attributionParams.set(key, first);
  }
  const attribution = normalizeAttribution(attributionParams);
  const resolved = await resolvePlanByIdOrSlug(idOrSlug);
  if (!resolved) notFound();
  const id = resolved.id;

  // Fetch plan and presentation (we already have plan via resolver, but
  // getPlanWithPresentation also fetches presentation; reuse for shape)
  let plan, presentation;
  try {
    const result = await getPlanWithPresentation(id);
    plan = result.plan;
    presentation = result.presentation;
  } catch {
    notFound();
  }

  if (!plan) notFound();

  // Visibility gate: non-admin users can only see published presentations
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  if (!isAdmin) {
    if (!isPublicPlanPresentation(plan, presentation)) {
      notFound();
    }
  }

  const canonicalPath = planPath(plan, "product");
  if (idOrSlug !== (plan.slug ?? plan.id)) {
    permanentRedirect(withQueryString(canonicalPath, query));
  }

  // Track product view (authenticated users only, fire-and-forget)
  if (session?.user?.id && plan && presentation) {
    recordEvent({
      userId: session.user.id,
      eventType: "product_viewed",
      properties: { planId: plan.id, planName: presentation.title, offeringType: presentation.offeringType, ...attribution },
      source: "web",
    }).catch(() => {});
  }

  const delivery = await getDeliveryOverviewForPlan(id, undefined, { includeUnpublished: isAdmin });

  // Fetch course syllabus from DB for course-type offerings
  const syllabus =
    presentation?.offeringType === "course"
      ? await getPublishedCourseSyllabusForPlan(id)
      : null;

  // Check if user already purchased
  let alreadyPurchased = false;
  let purchaseCtaContext: "start" | "continue" | "view" = "view";
  if (session?.user?.id) {
    const access = await checkPlanAccess(
      session.user.id,
      id,
      session.user.email,
      session.user.role,
    );
    alreadyPurchased = access.hasAccess;

    // Determine contextual CTA for already-purchased users
    if (alreadyPurchased && presentation?.offeringType === "course") {
      const planCourseRows = await db
        .select({ id: planCourses.id })
        .from(planCourses)
        .where(and(eq(planCourses.planId, id), isNull(planCourses.removedAt)))
        .limit(1);

      if (planCourseRows.length > 0) {
        const courseIds = (
          await db
            .select({ id: courses.id })
            .from(planCourses)
            .innerJoin(courses, eq(planCourses.courseId, courses.id))
            .where(
              and(
                eq(planCourses.planId, id),
                isNull(planCourses.removedAt),
                isNull(courses.deletedAt),
              ),
            )
        ).map((r) => r.id);

        if (courseIds.length > 0) {
          const lessonIds = (
            await db
              .select({ id: lessons.id })
              .from(lessons)
              .where(
                and(
                  inArray(lessons.courseId, courseIds),
                  isNull(lessons.deletedAt),
                ),
              )
          ).map((r) => r.id);

          if (lessonIds.length > 0) {
            const hasProgress = await db
              .select({ id: userProgress.id })
              .from(userProgress)
              .where(
                and(
                  eq(userProgress.userId, session.user.id),
                  inArray(userProgress.lessonId, lessonIds),
                  eq(userProgress.completed, true),
                ),
              )
              .limit(1);

            purchaseCtaContext = hasProgress.length > 0 ? "continue" : "start";
          }
        }
      }
    }
  }

  // Determine CTA based on plan status, purchase state, and checkout mode.
  // 詳情頁右側才是真正的「購買 CTA」：列表/Banner 永遠只導航到這裡。
  const isPlanActive = plan.status === "active";
  const isFreeEvent = presentation?.offeringType === "free_event";
  const purchaseButtonMode = plan.purchaseButtonMode ?? "internal";
  const isFreeAccess = purchaseButtonMode === "free_claim";
  const isExternalCheckout =
    !alreadyPurchased &&
    isPlanActive &&
    purchaseButtonMode === "external" &&
    !!plan.externalCheckoutUrl;
  const isFreeClaim = !alreadyPurchased && isPlanActive && isFreeAccess;
  const defaultCtaText = isFreeClaim
    ? "免費領取"
    : isFreeEvent
      ? "免費報名"
      : plan.billingPeriod === "one-time"
        ? "立即購買"
        : "立即訂閱";
  const ctaText = alreadyPurchased
    ? purchaseCtaContext === "continue"
      ? "繼續學習"
      : purchaseCtaContext === "start"
        ? "開始學習"
        : "前往我的內容"
    : !isPlanActive
      ? "已停售"
      : isExternalCheckout
        ? (plan.externalCheckoutLabel ?? presentation?.ctaLabel ?? "前往購買")
        : (presentation?.ctaLabel || defaultCtaText);
  const ctaHref = alreadyPurchased
    ? purchaseCtaContext === "continue" || purchaseCtaContext === "start"
      ? planPath(plan, "my")
      : planPath(plan, "my")
    : isExternalCheckout
      ? plan.externalCheckoutUrl!
      : isFreeClaim && !session?.user
        ? `/login?callbackUrl=${planPath(plan, "product")}`
        : planPath(plan, "checkout");
  const ctaDisabled =
    (!alreadyPurchased && !isPlanActive) ||
    (!alreadyPurchased && isPlanActive && purchaseButtonMode === "disabled");
  const ctaNewTab = isExternalCheckout && plan.externalCheckoutNewTab;
  const showFreeClaimForm = isFreeClaim && !!session?.user;
  const billingLabel = getBillingLabel(plan.billingPeriod, isFreeAccess);

  // Use presentation title if available, fallback to plan name
  const displayTitle = presentation?.title || plan.name;
  const displayDescription = presentation?.description || plan.description;
  const displayImage = presentation?.coverImage || plan.image;
  const typeLabel = presentation ? offeringTypeLabels[presentation.offeringType as OfferingType] : "商品";
  const metadata =
    (presentation?.metadataJson as Record<string, unknown> | null) || null;
  const hasSalesSections = hasStructuredSalesSections(metadata);
  const urgencyNote =
    typeof metadata?.urgencyNote === "string" ? metadata.urgencyNote : null;
  const heroSummary = metadata && Array.isArray(metadata.heroSummary)
    ? (metadata.heroSummary as string[]).filter((item) => item.trim().length > 0)
    : [];
  const productLoginHref = `/login?callbackUrl=${planPath(plan, "product")}`;

  // Extract testimonials for JSON-LD
  const testimonials = (metadata?.testimonials as TestimonialItem[]) || undefined;

  // Build breadcrumb list
  const breadcrumbItems = [
    { name: siteName, url: "/" },
    { name: "探索內容與活動", url: "/products" },
    { name: displayTitle, url: `/products/${plan.slug ?? plan.id}` },
  ];

  // Determine which schema to use based on offering type
  const isCourseType = presentation?.offeringType === "course";
  const schemaData = isCourseType
    ? courseSchema(plan, presentation, { testimonials })
    : productSchema(plan, presentation, { testimonials });

  return (
    <article className="min-h-screen overflow-x-clip bg-surface">
      {/* JSON-LD: BreadcrumbList + Product/Course + Reviews */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbListSchema(breadcrumbItems)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schemaData) }}
      />
      <section id="overview" className="scroll-mt-28 border-b border-border-subtle bg-surface-hover">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:py-12">
          <Link prefetch={false} href="/products" className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-medium text-text-muted transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ArrowLeft size={17} weight="bold" aria-hidden="true" />
            返回全部內容
          </Link>

          <div className="mt-5 grid gap-8 xl:grid-cols-[minmax(22rem,0.82fr)_minmax(0,1.18fr)] xl:items-stretch xl:gap-12">
            <FadeIn delay={0}>
              <ProductHeroArtwork image={displayImage} title={displayTitle} typeLabel={typeLabel} />
            </FadeIn>

            <FadeIn delay={0.08} className="flex min-h-full flex-col py-1 xl:py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">{typeLabel}</Badge>
                {alreadyPurchased ? <Badge variant="success">{isFreeAccess ? "已加入" : "已購買"}</Badge> : null}
                <span className="ml-auto font-mono text-xs text-text-muted">{billingLabel}</span>
              </div>

              <h1 className="mt-6 font-display text-4xl font-medium leading-[1.02] tracking-[-0.055em] text-text-primary [overflow-wrap:anywhere] sm:text-5xl xl:text-[3.5rem]">
                {displayTitle}
              </h1>
              {presentation?.subtitle ? (
                <p className="mt-5 max-w-3xl text-base leading-7 text-text-secondary [overflow-wrap:anywhere] sm:text-lg sm:leading-8">
                  {presentation.subtitle}
                </p>
              ) : null}

              {heroSummary.length > 0 ? (
                <ol className="mt-7 divide-y divide-border-subtle border-y border-border-subtle" aria-label="內容重點">
                  {heroSummary.map((item, index) => (
                    <li key={item} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3.5">
                      <span className="font-mono text-xs text-accent">0{index + 1}</span>
                      <p className="text-sm leading-6 text-text-secondary">{item}</p>
                    </li>
                  ))}
                </ol>
              ) : null}

              <div className="mt-auto pt-8">
                {!alreadyPurchased ? (
                  <div className="mb-5 flex items-end justify-between gap-5 border-t border-border pt-6">
                    <div>
                      <p className="text-xs text-text-muted">{isFreeAccess ? "費用" : "價格"}</p>
                      <p className="mt-1 font-display text-3xl font-medium tracking-[-0.04em] text-text-primary">{formatPrice(plan.amount)}</p>
                    </div>
                    {urgencyNote ? <p className="max-w-xs text-right text-xs leading-5 text-warning">{urgencyNote}</p> : null}
                  </div>
                ) : (
                  <div className="mb-5 border-t border-border pt-6">
                    <p className="text-sm font-medium text-success">
                      {isFreeAccess ? "這項內容已加入你的帳號" : "這項內容已在你的帳號中"}
                    </p>
                  </div>
                )}
                <p className="max-w-xl text-sm leading-6 text-text-secondary">
                  {alreadyPurchased
                    ? "你已擁有這項內容，可直接從頁面固定操作列前往會員中心。"
                    : "先確認內容、適合對象與取得方式，再從頁面固定操作列完成下一步。"}
                </p>
                <div className="mt-5 hidden xl:block">
                  <PurchaseAction
                    planId={plan.id}
                    ctaText={ctaText}
                    ctaHref={ctaHref}
                    ctaDisabled={ctaDisabled}
                    isExternalCheckout={isExternalCheckout}
                    ctaNewTab={ctaNewTab}
                    showFreeClaimForm={showFreeClaimForm}
                    attribution={attribution}
                  />
                  <div className="mt-3">
                    <PurchaseNote
                      isExternalCheckout={isExternalCheckout}
                      ctaDisabled={ctaDisabled}
                      isFreeClaim={isFreeClaim}
                      email={session?.user?.email}
                      loginHref={productLoginHref}
                    />
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 md:py-14">

        <ProductSectionNav
          hasSales={hasSalesSections}
          alreadyPurchased={alreadyPurchased}
          isFreeAccess={isFreeAccess}
        />

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Left Column: decision path + concrete delivery */}
          <FadeIn delay={0.1} className="min-w-0">
            {!alreadyPurchased && presentation && hasSalesSections ? (
              <>
                <div id="fit" className="mb-12 scroll-mt-28">
                  <CommonSalesSections metadata={metadata} phase="fit" />
                </div>
                <div className="mb-12">
                  <CommonSalesSections metadata={metadata} phase="value" />
                </div>
              </>
            ) : null}

            {!alreadyPurchased && displayDescription ? (
              hasSalesSections ? (
                <details className="group mb-12 overflow-hidden rounded-xl border border-border-subtle bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    閱讀完整介紹
                    <span className="text-xs font-normal text-text-muted group-open:hidden">展開</span>
                    <span className="hidden text-xs font-normal text-text-muted group-open:inline">收合</span>
                  </summary>
                  <div className="border-t border-border-subtle px-5 py-6 sm:px-7">
                    <Markdown content={displayDescription} />
                  </div>
                </details>
              ) : (
                <div className="mb-12">
                  <Markdown content={displayDescription} />
                </div>
              )
            ) : null}

            {/* Programmatic sections (syllabus, delivery info) */}
            <div id="content" className="scroll-mt-28">
              {presentation ? (
                <OfferingDetailSections
                  offeringType={presentation.offeringType as OfferingType}
                  metadata={metadata}
                  syllabus={syllabus}
                  isFreeAccess={isFreeAccess}
                />
              ) : (
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-6">
                <div className="rounded-lg border border-zinc-100 bg-white p-6">
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-medium uppercase text-zinc-500">
                    {isFreeAccess ? "領取後取得" : "購買後取得"}
                  </span>
                  <div className="mt-4 grid gap-3 text-sm text-zinc-600">
                    {(isFreeAccess
                      ? ["登入帳號", "免費加入內容", "回到會員中心開始使用"]
                      : ["完成付款", "回到會員中心", "取得課程、檔案或服務狀態"]
                    ).map((step, index) => (
                      <div key={step} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!delivery.hasDelivery && (
                  <p className="mt-6 text-sm leading-relaxed text-zinc-500">
                    付款完成後，商品會出現在會員中心；交付內容會依商品設定開放。
                  </p>
                )}

                {delivery.courses.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-medium uppercase text-zinc-500">課程內容</p>
                    {delivery.courses.map((course) => (
                      <div
                        key={course.id}
                        className="flex items-center gap-3 rounded-lg bg-white px-4 py-3"
                      >
                        <BookOpen
                          weight="duotone"
                          className="h-4 w-4 flex-shrink-0 text-emerald-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-700">
                            {course.title}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {course.lessonCount} 個章節
                          </p>
                        </div>
                        <CheckCircle
                          weight="fill"
                          className="h-3.5 w-3.5 flex-shrink-0 text-zinc-300"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {delivery.contents.length > 0 && (
                  <ol className="mt-6 space-y-2">
                    <p className="text-xs font-medium uppercase text-zinc-500">資料清單</p>
                    {delivery.contents.map((item, index) => {
                      const config =
                        contentTypeConfig[item.type] ??
                        contentTypeConfig["text"];
                      const { Icon } = config;

                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg bg-white px-4 py-3"
                        >
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
                            {index + 1}
                          </span>
                          <Icon
                            weight="duotone"
                            className="h-4 w-4 flex-shrink-0 text-zinc-400"
                          />
                          <span className="text-sm font-medium text-zinc-700">
                            {item.title}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {delivery.activeServiceCount > 0 && (
                  <div className="mt-6 rounded-lg bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Plugs
                        weight="duotone"
                        className="h-4 w-4 flex-shrink-0 text-blue-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-700">
                          服務開通
                        </p>
                        <p className="text-xs text-zinc-400">
                          付款完成後由系統建立服務權限
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {!alreadyPurchased && presentation && hasSalesSections ? (
              <div className="mt-12">
                <CommonSalesSections metadata={metadata} phase="proof" />
              </div>
            ) : null}
          </FadeIn>

          {/* Right Column: Sticky action panel (desktop) */}
          <FadeIn delay={0.15} className="hidden self-start xl:sticky xl:top-24 xl:block">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="mb-5 flex items-center justify-between gap-3">
                <Badge variant="success">{typeLabel}</Badge>
                <span className="text-xs text-text-muted">{billingLabel}</span>
              </div>

              {/* Already purchased badge */}
              {alreadyPurchased && (
                <div className="mb-4 rounded-lg border border-success/20 bg-success-light px-4 py-3">
                  <p className="text-sm font-medium text-success">
                    ✓ {isFreeAccess ? "你已加入此內容" : "你已購買此內容"}
                  </p>
                </div>
              )}

              {!alreadyPurchased ? (
                <div className="mb-6">
                  <p className="text-[10px] font-medium uppercase text-text-muted">
                    {isFreeAccess ? "費用" : "定價"}
                  </p>
                  <p className="mt-2 font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">
                    {formatPrice(plan.amount)}
                  </p>
                  {plan.billingPeriod !== "one-time" && (
                    <p className="mt-1 text-xs text-text-muted">
                      {billingLabel}
                    </p>
                  )}
                  {urgencyNote && (
                    <p className="mt-3 rounded-lg border border-warning/20 bg-warning-light px-3 py-2 text-xs leading-5 text-warning">
                      {urgencyNote}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Summary Info */}
              {presentation && (
                <div className="mb-6 space-y-3 border-t border-border-subtle pt-6">
                  {presentation.offeringType === "course" && (
                    <>
                      {syllabus ? (
                        <>
                          <SidebarRow label="章節" value={`${syllabus.chapters.length} 章`} />
                          <SidebarRow label="課堂" value={`${syllabus.totalLessons} 堂`} />
                          {syllabus.totalDurationSeconds > 0 && (
                            <SidebarRow
                              label="時長"
                              value={`~${Math.round((syllabus.totalDurationSeconds / 3600) * 10) / 10} 小時`}
                            />
                          )}
                          {syllabus.previewCount > 0 && (
                            <SidebarRow label="免費試看" value={`${syllabus.previewCount} 堂`} />
                          )}
                        </>
                      ) : (
                        <>
                          {typeof metadata?.chapterCount === "number" && (
                            <SidebarRow label="章節" value={`${metadata?.chapterCount} 章`} />
                          )}
                          {typeof metadata?.lessonCount === "number" && (
                            <SidebarRow label="課堂" value={`${metadata?.lessonCount} 堂`} />
                          )}
                          {typeof metadata?.estimatedHours === "number" && (
                            <SidebarRow label="時長" value={`約 ${metadata?.estimatedHours} 小時`} />
                          )}
                        </>
                      )}
                    </>
                  )}
                  {presentation.offeringType === "lecture" && (() => {
                    const m = presentation.metadataJson as Record<string, unknown> | null;
                    return m ? (
                      <>
                        {m.speaker && <SidebarRow label="講者" value={m.speaker as string} />}
                        {m.eventDate && <SidebarRow label="日期" value={new Date(m.eventDate as string).toLocaleDateString("zh-TW")} />}
                        {m.hasReplay != null && <SidebarRow label="回放" value={m.hasReplay ? "提供" : "僅直播"} />}
                      </>
                    ) : null;
                  })()}
                  {presentation.offeringType === "service" && (() => {
                    const m = presentation.metadataJson as Record<string, unknown> | null;
                    return m ? (
                      <>
                        {m.expectedTimelineWeeks && <SidebarRow label="時程" value={`約 ${m.expectedTimelineWeeks} 週`} />}
                        {Array.isArray(m.deliverySteps) && <SidebarRow label="交付" value={`${m.deliverySteps.length} 項`} />}
                      </>
                    ) : null;
                  })()}
                  {presentation.offeringType === "membership" && (() => {
                    const m = presentation.metadataJson as Record<string, unknown> | null;
                    const freq: Record<string, string> = { daily: "每日", weekly: "每週", monthly: "每月", quarterly: "每季" };
                    return m ? (
                      <>
                        {Array.isArray(m.benefits) && <SidebarRow label="權益" value={`${m.benefits.length} 項`} />}
                        {m.updateFrequency && <SidebarRow label="更新" value={freq[m.updateFrequency as string] || (m.updateFrequency as string)} />}
                      </>
                    ) : null;
                  })()}
                  {(presentation.offeringType === "offline_event" || presentation.offeringType === "free_event") && (() => {
                    const m = presentation.metadataJson as Record<string, unknown> | null;
                    return m ? (
                      <>
                        {m.eventDate && <SidebarRow label="日期" value={new Date(m.eventDate as string).toLocaleDateString("zh-TW")} />}
                        {m.venue && <SidebarRow label="地點" value={m.venue as string} />}
                        {m.capacity && <SidebarRow label="名額" value={`${m.capacity} 人`} />}
                      </>
                    ) : null;
                  })()}
                </div>
              )}

              <PurchaseAction
                planId={plan.id}
                ctaText={ctaText}
                ctaHref={ctaHref}
                ctaDisabled={ctaDisabled}
                isExternalCheckout={isExternalCheckout}
                ctaNewTab={ctaNewTab}
                showFreeClaimForm={showFreeClaimForm}
                attribution={attribution}
              />
              <div className="mt-3">
                <PurchaseNote
                  isExternalCheckout={isExternalCheckout}
                  ctaDisabled={ctaDisabled}
                  isFreeClaim={isFreeClaim}
                  email={session?.user?.email}
                  loginHref={productLoginHref}
                />
              </div>
            </div>
          </FadeIn>
        </div>

        {!alreadyPurchased ? (
          <FadeIn
            delay={0.2}
            id="trust"
            className="mt-16 scroll-mt-28 border-t border-border-subtle pt-16"
          >
            <TrustBlock
              trustNotes={presentation?.trustNotesJson as TrustBlockType[] | null || undefined}
              title={getTrustSectionTitle(isFreeAccess)}
            />
          </FadeIn>
        ) : null}
      </section>

      {/* Mobile Bottom CTA */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-surface/96 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_28px_rgba(18,28,25,0.08)] backdrop-blur-md xl:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-24 shrink-0">
            <p className="text-[0.65rem] text-text-muted">
              {alreadyPurchased ? "目前狀態" : isFreeAccess ? "費用" : "價格"}
            </p>
            <p className="truncate font-display text-lg font-medium tracking-[-0.025em] text-text-primary">
              {alreadyPurchased
                ? isFreeAccess
                  ? "已加入"
                  : "已購買"
                : formatPrice(plan.amount)}
            </p>
          </div>
          <PurchaseAction
            planId={plan.id}
            ctaText={ctaText}
            ctaHref={ctaHref}
            ctaDisabled={ctaDisabled}
            isExternalCheckout={isExternalCheckout}
            ctaNewTab={ctaNewTab}
            showFreeClaimForm={showFreeClaimForm}
            attribution={attribution}
            className="min-w-0 flex-1"
          />
        </div>
        {isExternalCheckout && !ctaDisabled ? (
          <div className="mx-auto mt-2 max-w-2xl">
            <PurchaseNote
              isExternalCheckout={isExternalCheckout}
              ctaDisabled={ctaDisabled}
              isFreeClaim={isFreeClaim}
              email={session?.user?.email}
              loginHref={productLoginHref}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
