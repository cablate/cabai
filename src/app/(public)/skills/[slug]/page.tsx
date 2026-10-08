import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/constants";
import { getPublicSkillProjection } from "@/lib/services/skill-release-service";
import { SkillDetail } from "@/components/public/skills/skill-catalog";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
async function load(slug: string) { const session = await auth(); const authenticated = Boolean(session?.user?.id); return { authenticated, result: await getPublicSkillProjection(slug, { authenticated }) }; }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { result } = await load(slug);
  if (!result.ok) {
    return {
      title: "Skill 找不到",
      robots: { index: false, follow: false },
    };
  }

  const title = `${result.value.title} Skill`;
  const url = `/skills/${result.value.slug}`;
  return {
    title,
    description: result.value.summary,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${BRAND_NAME}`,
      description: result.value.summary,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${BRAND_NAME}`,
      description: result.value.summary,
    },
  };
}
export default async function Page({ params }: Props) { const { slug } = await params; const { authenticated, result } = await load(slug); if (!result.ok) { if (result.kind === "not-found") notFound(); throw new Error("Public Skill unavailable"); } return <section className="min-h-screen bg-surface-hover"><SkillDetail skill={result.value} authenticated={authenticated} /></section>; }
