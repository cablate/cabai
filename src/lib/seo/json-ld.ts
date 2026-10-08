/**
 * JSON-LD 結構化資料產生器
 *
 * 提供各頁面所需的 Schema.org JSON-LD 物件。
 * 每個函數回傳純物件，由 <script type="application/ld+json"> 渲染。
 */

import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { BRAND_NAME, CREATOR_NAME, CREATOR_URL } from "@/lib/constants";
import { getAppBaseUrl } from "@/lib/app-url";
import type { TestimonialItem } from "@/lib/validations/plan-presentations";

// ─── Helpers ───

const BASE_URL = getAppBaseUrl();
const SITE_NAME = BRAND_NAME;
const ORGANIZATION_ID = `${BASE_URL}/#organization`;
const WEBSITE_ID = `${BASE_URL}/#website`;

function absUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// ─── Organization ───

export interface OrganizationSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  "@id": string;
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  founder: {
    "@type": "Person";
    name: string;
    url: string;
  };
}

export function organizationSchema(opts?: {
  logo?: string;
  description?: string;
  sameAs?: string[];
}): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: BASE_URL,
    ...(opts?.logo ? { logo: absUrl(opts.logo) } : {}),
    ...(opts?.description ? { description: opts.description } : {}),
    ...(opts?.sameAs ? { sameAs: opts.sameAs } : {}),
    founder: {
      "@type": "Person",
      name: CREATOR_NAME,
      url: CREATOR_URL,
    },
  };
}

// ─── WebSite ───

export interface WebSiteSchema {
  "@context": "https://schema.org";
  "@type": "WebSite";
  "@id": string;
  name: string;
  url: string;
  description?: string;
  creator: {
    "@type": "Person";
    name: string;
    url: string;
  };
  publisher: {
    "@id": string;
  };
  potentialAction?: {
    "@type": "SearchAction";
    target: {
      "@type": "EntryPoint";
      urlTemplate: string;
    };
    "query-input": string;
  };
}

export function websiteSchema(opts?: {
  description?: string;
  enableSearch?: boolean;
}): WebSiteSchema {
  const schema: WebSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: BASE_URL,
    ...(opts?.description ? { description: opts.description } : {}),
    creator: {
      "@type": "Person",
      name: CREATOR_NAME,
      url: CREATOR_URL,
    },
    publisher: {
      "@id": ORGANIZATION_ID,
    },
  };

  if (opts?.enableSearch !== false) {
    schema.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    };
  }

  return schema;
}

// ─── BreadcrumbList ───

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface BreadcrumbListSchema {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
}

export function breadcrumbListSchema(items: BreadcrumbItem[]): BreadcrumbListSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absUrl(item.url),
    })),
  };
}

// ─── Article ───

export interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  url: string;
  image: string[];
  datePublished?: string;
  dateModified: string;
  mainEntityOfPage: {
    "@type": "WebPage";
    "@id": string;
  };
  author: {
    "@type": "Person";
    name: string;
    url: string;
  };
  publisher: {
    "@id": string;
    "@type": "Organization";
    name: string;
    url: string;
  };
}

export function articleSchema(input: {
  headline: string;
  description: string;
  url: string;
  image: string;
  datePublished: Date | null;
  dateModified: Date;
}): ArticleSchema {
  const url = absUrl(input.url);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    url,
    image: [absUrl(input.image)],
    ...(input.datePublished
      ? { datePublished: input.datePublished.toISOString() }
      : {}),
    dateModified: input.dateModified.toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    author: {
      "@type": "Person",
      name: CREATOR_NAME,
      url: CREATOR_URL,
    },
    publisher: {
      "@id": ORGANIZATION_ID,
      "@type": "Organization",
      name: SITE_NAME,
      url: BASE_URL,
    },
  };
}

// ─── Product ───

export interface ProductSchema {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image?: string | string[];
  offers: {
    "@type": "Offer";
    price: number;
    priceCurrency: string;
    availability: "https://schema.org/InStock" | "https://schema.org/LimitedAvailability" | "https://schema.org/Discontinued";
    url: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
    bestRating: number;
  };
  review?: ReviewSchema[];
}

export interface ReviewSchema {
  "@type": "Review";
  author: { "@type": "Person"; name: string };
  reviewBody?: string;
  reviewRating?: {
    "@type": "Rating";
    ratingValue: number;
    bestRating: number;
  };
  datePublished?: string;
}

/**
 * 從 TestimonialItem 陣列計算平均評分與總數。
 */
function computeAggregateRating(
  testimonials: TestimonialItem[]
): { ratingValue: number; reviewCount: number } | null {
  const withRating = testimonials.filter((t) => typeof t.rating === "number");
  if (withRating.length === 0) return null;
  const sum = withRating.reduce((acc, t) => acc + (t.rating as number), 0);
  return {
    ratingValue: Math.round((sum / withRating.length) * 10) / 10,
    reviewCount: withRating.length,
  };
}

export function productSchema(
  plan: Plan,
  presentation: PlanPresentation | null,
  opts?: { testimonials?: TestimonialItem[] }
): ProductSchema {
  const title = presentation?.title || plan.name;
  const description =
    presentation?.subtitle || plan.description || undefined;
  const image = presentation?.coverImage || plan.image || undefined;
  const productUrl = `${BASE_URL}/products/${plan.slug ?? plan.id}`;

  const schema: ProductSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    ...(description ? { description } : {}),
    ...(image ? { image: absUrl(image) } : {}),
    offers: {
      "@type": "Offer",
      price: plan.amount / 100, // Convert cents to main unit
      priceCurrency: plan.currency || "TWD",
      availability:
        plan.status === "active"
          ? "https://schema.org/InStock"
          : "https://schema.org/Discontinued",
      url: productUrl,
    },
  };

  // Add aggregate rating from testimonials
  const testimonials = opts?.testimonials;
  if (testimonials && testimonials.length > 0) {
    const agg = computeAggregateRating(testimonials);
    if (agg) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: agg.ratingValue,
        reviewCount: agg.reviewCount,
        bestRating: 5,
      };
    }

    // Add individual reviews (limit to top 10 to keep page size reasonable)
    const reviewsWithRating = testimonials.filter(
      (t): t is TestimonialItem & { rating: number } => typeof t.rating === "number"
    );
    if (reviewsWithRating.length > 0) {
      schema.review = reviewsWithRating.slice(0, 10).map((t) => ({
        "@type": "Review" as const,
        author: { "@type": "Person" as const, name: t.name },
        ...(t.content ? { reviewBody: t.content } : {}),
        reviewRating: {
          "@type": "Rating" as const,
          ratingValue: t.rating,
          bestRating: 5,
        },
      }));
    }
  }

  return schema;
}

// ─── Course (for course-type offerings) ───

export interface CourseSchema {
  "@context": "https://schema.org";
  "@type": "Course";
  name: string;
  description?: string;
  image?: string;
  provider: {
    "@type": "Organization";
    name: string;
    sameAs?: string;
  };
  offers?: {
    "@type": "Offer";
    price: number;
    priceCurrency: string;
    availability: string;
    url: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
    bestRating: number;
  };
  totalHistoricalEnrollment?: number;
}

export function courseSchema(
  plan: Plan,
  presentation: PlanPresentation | null,
  opts?: {
    testimonials?: TestimonialItem[];
    enrollmentCount?: number;
  }
): CourseSchema {
  const title = presentation?.title || plan.name;
  const description =
    presentation?.subtitle || plan.description || undefined;
  const image = presentation?.coverImage || plan.image || undefined;
  const productUrl = `${BASE_URL}/products/${plan.slug ?? plan.id}`;

  const schema: CourseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: title,
    ...(description ? { description } : {}),
    ...(image ? { image: absUrl(image) } : {}),
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      sameAs: BASE_URL,
    },
    offers: {
      "@type": "Offer",
      price: plan.amount / 100,
      priceCurrency: plan.currency || "TWD",
      availability:
        plan.status === "active"
          ? "https://schema.org/InStock"
          : "https://schema.org/Discontinued",
      url: productUrl,
    },
  };

  if (opts?.enrollmentCount) {
    schema.totalHistoricalEnrollment = opts.enrollmentCount;
  }

  const testimonials = opts?.testimonials;
  if (testimonials && testimonials.length > 0) {
    const agg = computeAggregateRating(testimonials);
    if (agg) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: agg.ratingValue,
        reviewCount: agg.reviewCount,
        bestRating: 5,
      };
    }
  }

  return schema;
}

// ─── FAQPage ───

export interface FAQPageSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }>;
}

export function faqPageSchema(faqs: Array<{ q: string; a: string }>): FAQPageSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

// ─── JsonLd Component Helper ───

/** Serialize for an HTML script raw-text context, without changing JSON values. */
export function serializeJsonLd(data: object): string {
  // HTML parses script end tags even when the script contains JSON, not JavaScript.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}


/**
 * 產生 <script type="application/ld+json"> 的 HTML 字串（in HTML 而非 JSX）。
 * 用於在 Server Component 中注入 JSON-LD。
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${serializeJsonLd(data)}</script>`;
}
