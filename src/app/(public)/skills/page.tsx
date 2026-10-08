import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { listPublicSkills } from "@/lib/services/skill-release-service";
import { SkillList } from "@/components/public/skills/skill-catalog";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent Skills：可直接交給 AI 使用的工作方法",
  description: `探索 ${BRAND_NAME} 公開的 Agent Skills，取得可交給 Codex、Claude Code 等 AI Agent 使用的規劃、委派與工作流程。`,
  alternates: { canonical: "/skills" },
  openGraph: {
    title: `${BRAND_NAME} Agent Skills｜可直接交給 AI 使用的工作方法`,
    description: "取得可交給 Codex、Claude Code 等 AI Agent 使用的規劃、委派與工作流程。",
    url: "/skills",
    type: "website",
  },
};
export default async function Page() {
  const session = await auth();
  const result = await listPublicSkills({ authenticated: Boolean(session?.user?.id) });
  if (!result.ok) throw new Error("Public Skills unavailable");

  return (
    <section className="min-h-[calc(100dvh-var(--site-header-height))] bg-surface-hover">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <SkillList skills={result.value} />
      </div>
    </section>
  );
}
