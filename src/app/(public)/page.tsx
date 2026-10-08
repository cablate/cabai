import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroSection } from "./sections/hero";
import { HomeStartSection } from "./sections/home-start";
import { HomeOfferingShowcase } from "./sections/home-offering-showcase";
import { FaqSection } from "./sections/faq";
import { HomeMotion } from "./sections/home-motion";
import { HomeLibrarySection } from "./sections/home-library";
import { auth } from "@/lib/auth";
import { getEntitledPlanIds } from "@/lib/access";
import { faqPageSchema, serializeJsonLd } from "@/lib/seo/json-ld";
import { BRAND_NAME } from "@/lib/constants";
import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import {
  getCachedPublishedLibraryEntries,
  getCachedPublishedPlanPresentations,
} from "@/lib/public-site-cache";
import {
  normalizeCachedLibraryEntry,
  selectHomeLibraryEntries,
} from "@/lib/seo/library-discovery";
import { faqs } from "./sections/faq-data";

export const dynamic = "force-dynamic";

const siteName = BRAND_NAME;
const defaultOgImage = PUBLIC_BRANDING.socialImage;

export const metadata: Metadata = {
  title: "AI Agent 課程、Skills 與 Agent API",
  description:
    `${siteName} 提供 AI Agent、Claude Code 與 Vibe Coding 課程、可直接使用的 Agent Skills、工程文章及 Agent API。`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${siteName}｜AI Agent 課程、Skills 與 Agent API`,
    description:
      `${siteName} 把 AI 課程、Agent Skills 與工程知識接進你和 AI 的工作流程。`,
    url: "/",
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
    title: `${siteName}｜AI Agent 課程、Skills 與 Agent API`,
    description:
      `${siteName} 把 AI 課程、Agent Skills 與工程知識接進你和 AI 的工作流程。`,
    images: [defaultOgImage],
  },
};

async function PersonalizedOfferingShowcase({
  offerings,
}: {
  offerings: Awaited<ReturnType<typeof getCachedPublishedPlanPresentations>>;
}) {
  const session = await auth();
  const purchasedPlanIds = session?.user?.id
    ? Array.from(await getEntitledPlanIds(session.user.id))
    : [];

  return (
    <HomeOfferingShowcase
      offerings={offerings}
      purchasedPlanIds={purchasedPlanIds}
    />
  );
}

export default async function HomePage() {
  const [offerings, libraryResult] = await Promise.all([
    getCachedPublishedPlanPresentations(),
    getCachedPublishedLibraryEntries(),
  ]);
  const libraryEntries = libraryResult.ok
    ? selectHomeLibraryEntries(libraryResult.value.map(normalizeCachedLibraryEntry))
    : [];

  return (
    <>
      {/* FAQPage JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(faqPageSchema(faqs)),
        }}
      />
      <HeroSection />
      <HomeStartSection />
      <Suspense
        fallback={<HomeOfferingShowcase offerings={offerings} purchasedPlanIds={[]} />}
      >
        <PersonalizedOfferingShowcase offerings={offerings} />
      </Suspense>
      <HomeLibrarySection entries={libraryEntries} />
      <FaqSection />
      <HomeMotion />
    </>
  );
}
