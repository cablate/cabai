import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { LibraryDetail } from "@/components/public/library/library-detail";
import { articleSchema, breadcrumbListSchema, serializeJsonLd } from "@/lib/seo/json-ld";
import { selectRelatedLibraryEntries } from "@/lib/seo/library-discovery";
import {
  getPublishedLibraryEntry,
  listPublishedLibraryEntries,
} from "@/lib/services/library-service";

export const dynamic = "force-dynamic";

interface LibraryDetailPageProps {
  params: Promise<{ slug: string }>;
}

const loadLibraryEntry = cache(getPublishedLibraryEntry);

export async function generateMetadata({ params }: LibraryDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadLibraryEntry(slug);
  if (!result.ok) {
    if (result.kind === "not-found") return { title: "文章不存在", robots: { index: false, follow: false } };
    throw new Error(`Library metadata unavailable: ${result.kind}`);
  }

  const canonical = `/library/${result.value.slug}`;
  const socialImage = `${canonical}/social-image`;
  return {
    title: result.value.title,
    description: result.value.summary,
    alternates: { canonical },
    openGraph: {
      title: result.value.title,
      description: result.value.summary,
      url: canonical,
      type: "article",
      images: [{
        url: socialImage,
        width: 1200,
        height: 630,
        alt: result.value.title,
      }],
      ...(result.value.publishedAt ? { publishedTime: result.value.publishedAt.toISOString() } : {}),
      modifiedTime: result.value.updatedAt.toISOString(),
      tags: result.value.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: result.value.title,
      description: result.value.summary,
      images: [socialImage],
    },
  };
}

export default async function LibraryDetailPage({ params }: LibraryDetailPageProps) {
  const { slug } = await params;
  const result = await loadLibraryEntry(slug);
  if (!result.ok) {
    if (result.kind === "not-found") notFound();
    throw new Error(`Library entry unavailable: ${result.kind}`);
  }

  if (slug !== result.value.slug) {
    permanentRedirect(`/library/${encodeURIComponent(result.value.slug)}`);
  }

  const canonical = `/library/${result.value.slug}`;
  const article = articleSchema({
    headline: result.value.title,
    description: result.value.summary,
    url: canonical,
    image: `${canonical}/social-image`,
    datePublished: result.value.publishedAt,
    dateModified: result.value.updatedAt,
  });
  const breadcrumb = breadcrumbListSchema([
    { name: "CabAI", url: "/" },
    { name: "Library", url: "/library" },
    { name: result.value.title, url: canonical },
  ]);
  const listResult = await listPublishedLibraryEntries();
  const related = listResult.ok
    ? selectRelatedLibraryEntries(result.value, listResult.value)
    : { entries: [], hasTagMatch: false };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
      <LibraryDetail
        entry={result.value}
        relatedEntries={related.entries}
        relatedByTag={related.hasTagMatch}
      />
    </>
  );
}
