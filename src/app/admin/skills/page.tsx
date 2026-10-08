import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAdminSkills } from "@/lib/services/skill-release-service";

function statusMeta(status: string): { label: string; variant: "default" | "success" | "warning" | "danger" | "info" } {
  switch (status) {
    case "published": return { label: "已發布", variant: "success" };
    case "deprecated": return { label: "已棄用", variant: "warning" };
    case "withdrawn": return { label: "已撤下", variant: "warning" };
    default: return { label: "草稿", variant: "default" };
  }
}

function nextStep(status: string): string {
  switch (status) {
    case "published": return "查看公開內容，或建立下一個 Release";
    case "deprecated": return "確認替代版本與後續公告";
    case "withdrawn": return "已停止公開；保留紀錄供後續判斷";
    default: return "補齊資料後，建立第一個 Release";
  }
}

export default async function AdminSkillsPage() {
  const result = await listAdminSkills();
  const stats = result.ok
    ? result.value.reduce((counts, skill) => {
      counts.total += 1;
      if (skill.status === "published") counts.published += 1;
      if (skill.status === "draft") counts.draft += 1;
      return counts;
    }, { total: 0, published: 0, draft: 0 })
    : null;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Skills</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">在這裡建立可被人與 Agent 使用的工作方法，並用 Release、檔案與公告一起完成發布。</p>
        </div>
        <Button asChild><Link prefetch={false} href="/admin/skills/new">新增 Skill</Link></Button>
      </header>

      {stats ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border-subtle bg-surface p-4">
            <dt className="text-xs font-medium text-text-muted">全部 Skills</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{stats.total}</dd>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface p-4">
            <dt className="text-xs font-medium text-text-muted">已發布</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">{stats.published}</dd>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface p-4">
            <dt className="text-xs font-medium text-text-muted">待完成草稿</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{stats.draft}</dd>
          </div>
        </dl>
      ) : null}

      <section className="rounded-xl border border-border-subtle bg-surface-muted p-5" aria-labelledby="skill-publish-flow-heading">
        <h2 id="skill-publish-flow-heading" className="text-sm font-semibold text-text-primary">發布流程</h2>
        <ol className="mt-3 grid gap-3 text-sm leading-6 text-text-secondary sm:grid-cols-4">
          <li><span className="mr-2 font-mono text-xs text-accent">01</span>建立 Skill 基本資料</li>
          <li><span className="mr-2 font-mono text-xs text-accent">02</span>新增可發布的 Release</li>
          <li><span className="mr-2 font-mono text-xs text-accent">03</span>上傳並驗證 ZIP 檔案</li>
          <li><span className="mr-2 font-mono text-xs text-accent">04</span>建立公告後一起發布</li>
        </ol>
      </section>

      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-light p-5 text-sm text-danger">{result.message}</div>
      ) : result.value.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface p-10 text-center">
          <h2 className="font-semibold text-text-primary">尚無 Skill</h2>
          <p className="mt-2 text-sm text-text-secondary">先建立 Skill 草稿，再加入 Release 與檔案。</p>
        </div>
      ) : (
        <section aria-labelledby="skill-list-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="skill-list-heading" className="text-lg font-semibold text-text-primary">管理中的 Skills</h2>
            <p className="text-sm text-text-muted">{result.value.length} 筆</p>
          </div>
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-card">
            {result.value.map((skill) => {
              const status = statusMeta(skill.status);
              return (
                <li key={skill.id}>
                  <Link prefetch={false} href={`/admin/skills/${skill.id}`} className="group block p-5 transition-colors hover:bg-surface-muted focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:scale-[0.995]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-text-primary group-hover:text-accent">{skill.title}</h3>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{skill.summary}</p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-text-muted">
                      <span>/{skill.slug}</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-text-secondary group-hover:text-accent">
                        下一步：{nextStep(skill.status)}
                        <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
