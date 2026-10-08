import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillForm } from "@/components/admin/skills/admin-skill-forms";
import { getAdminSkillProjection, getSkillReadiness } from "@/lib/services/skill-release-service";

function statusMeta(status: string): { label: string; variant: "default" | "success" | "warning" | "danger" | "info" } {
  switch (status) {
    case "published": return { label: "已發布", variant: "success" };
    case "deprecated": return { label: "已棄用", variant: "warning" };
    case "withdrawn": return { label: "已撤下", variant: "warning" };
    default: return { label: "草稿", variant: "default" };
  }
}

function accessLabel(accessPolicy: string): string {
  return accessPolicy === "public" ? "公開" : "需登入／User Agent token";
}

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projection, readiness] = await Promise.all([getAdminSkillProjection(id), getSkillReadiness(id)]);
  if (!projection.ok && projection.kind === "not-found") notFound();
  if (!projection.ok) return <div role="alert" className="text-danger">{projection.message}</div>;
  const { skill, releases } = projection.value;
  const status = statusMeta(skill.status);
  const skillReady = readiness.ok && readiness.value.ready;
  const nextStep = skill.status === "draft"
    ? (skillReady ? "Skill 基本資料已完成，接著建立 Release。" : "先補齊下方指出的基本資料。")
    : skill.status === "published"
      ? "公開頁已可查看；有更新時請建立新的 Release。"
      : "這個 Skill 目前不對外公開，保留此頁供後續決策。";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <Link prefetch={false} href="/admin/skills" className="inline-flex min-h-10 items-center text-sm font-medium text-accent transition-colors hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">← Skills</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{skill.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">/{skill.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {skill.status === "published" ? (
            <Button asChild variant="secondary"><Link prefetch={false} href={`/skills/${skill.slug}`} target="_blank">查看公開頁<ArrowUpRight size={16} data-icon="inline-end" aria-hidden="true" /></Link></Button>
          ) : null}
          {skill.status !== "withdrawn" ? <Button asChild><Link prefetch={false} href={`/admin/skills/${id}/releases/new`}>新增 Release</Link></Button> : null}
        </div>
      </header>

      <section className="rounded-xl border border-border-subtle bg-surface-muted p-5" aria-labelledby="skill-next-step-heading">
        <h2 id="skill-next-step-heading" className="text-sm font-semibold text-text-primary">目前下一步</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{nextStep}</p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <li className={skillReady ? "text-success" : "text-text-secondary"}><span className="mr-2 font-mono text-xs">01</span>Skill 資料</li>
          <li className={releases.length > 0 ? "text-success" : "text-text-secondary"}><span className="mr-2 font-mono text-xs">02</span>Release 與檔案</li>
          <li className={skill.status === "published" ? "text-success" : "text-text-secondary"}><span className="mr-2 font-mono text-xs">03</span>公告與發布</li>
        </ol>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary">基本資料</h2>
        <p className="mb-5 text-sm leading-6 text-text-secondary">這些資料會成為公開 Skill 的名稱、網址與摘要。發布後依現有規則不能直接修改。</p>
        {skill.status === "draft" ? <SkillForm skill={skill} /> : <p className="text-sm text-text-secondary">這個 Skill 已發布或撤下；基本資料目前依正式發布規則鎖定。</p>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">發布前檢查</h2>
        {!readiness.ok ? <p role="alert" className="mt-3 text-sm text-danger">{readiness.message}</p> : readiness.value.ready ? (
          <p className="mt-3 text-sm text-success">基本資料已就緒，可以建立或調整 Release。</p>
        ) : (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-danger">{readiness.value.issues.map((issue) => <li key={`${issue.field}:${issue.code}`}>{issue.message}</li>)}</ul>
        )}
      </section>

      <section aria-labelledby="skill-releases-heading">
        <div className="mb-4 flex items-center justify-between"><h2 id="skill-releases-heading" className="text-lg font-semibold text-text-primary">Releases</h2><span className="text-sm text-text-muted">{releases.length} 筆</span></div>
        {releases.length === 0 ? <p className="rounded-xl border border-border-subtle bg-surface p-8 text-center text-sm text-text-secondary">尚無 Release。建立後可填寫公開內容、上傳 ZIP，並檢查是否可以發布。</p> : (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-card">{releases.map((release) => {
            const releaseStatus = statusMeta(release.status);
            return (
              <li key={release.id}>
                <Link prefetch={false} href={`/admin/skills/${id}/releases/${release.id}`} className="group flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-muted focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:scale-[0.995]">
                  <span>
                    <span className="block font-medium text-text-primary group-hover:text-accent">Release {release.version}</span>
                    <span className="mt-1 block text-sm text-text-secondary">{accessLabel(release.accessPolicy)}</span>
                  </span>
                  <span className="inline-flex items-center gap-3"><Badge variant={releaseStatus.variant}>{releaseStatus.label}</Badge><ArrowUpRight size={16} className="text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" /></span>
                </Link>
              </li>
            );
          })}</ul>
        )}
      </section>
    </div>
  );
}
