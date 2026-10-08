import Link from "next/link";
import type { PublicSkillProjection, PublicSkillReleaseProjection } from "@/lib/services/skill-release-service";
import { ArrowLeft, CaretDown } from "@phosphor-icons/react/dist/ssr";
import { CABAI_AGENT_BASE_URL } from "@/lib/agent/prompt-copy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Markdown } from "@/components/ui/markdown";
import { Separator } from "@/components/ui/separator";
import { LibraryMarkdown } from "@/components/public/library/library-markdown";
import { SkillCatalogClient } from "./skill-catalog-client";
import { SkillQuickActions } from "./skill-quick-actions";

const date = (value: Date) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(value);
const downloadHref = (slug: string, version: string) => `/skills/${encodeURIComponent(slug)}/releases/${encodeURIComponent(version)}/download`;

export function SkillList({ skills }: { skills: PublicSkillProjection[] }) {
  return <SkillCatalogClient skills={skills} />;
}

function ReleaseFacts({ release }: { release: PublicSkillReleaseProjection }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-text-muted">相容環境</dt>
        <dd className="mt-1 leading-6 text-text-primary [overflow-wrap:anywhere]">{release.compatibility}</dd>
      </div>
      <div>
        <dt className="text-text-muted">授權</dt>
        <dd className="mt-1 leading-6 text-text-primary [overflow-wrap:anywhere]">{release.license}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-text-muted">SHA-256</dt>
        <dd className="mt-1 rounded-md bg-surface-code px-3 py-2 text-text-code">
          <code className="break-all font-mono text-xs">{release.checksumSha256}</code>
        </dd>
      </div>
    </dl>
  );
}

export function SkillDetail({ skill, authenticated }: { skill: PublicSkillProjection; authenticated: boolean }) {
  const current = skill.currentRelease;
  const agentEndpoint = `${CABAI_AGENT_BASE_URL}/api/agent/public/v1/skills/${encodeURIComponent(skill.slug)}`;
  const github = current.distribution.mode === "github" ? current.distribution : null;
  const installPrompt = github
    ? `請從 GitHub 安裝 ${skill.title}：${github.repositoryUrl}\n\n先閱讀 Repository 內的 install/AGENT-INSTALL.md，依照手冊完成安裝。安裝前確認目標位置，不要覆蓋無關檔案。`
    : undefined;
  const agentPrompt = github
    ? `查詢 ${skill.title} 的 CabAI 公開介紹與 GitHub 來源：\nGET ${agentEndpoint}\n\n需要完整 Skill 或安裝方式時，直接使用回應中的 currentRelease.distribution.repositoryUrl 前往 GitHub。`
    : `查詢 ${skill.title} 的 CabAI 公開資訊：\nGET ${agentEndpoint}`;
  const download = !github && current.downloadableForViewer
    ? { kind: "available" as const, href: downloadHref(skill.slug, current.version!) }
    : authenticated
      ? { kind: "unavailable" as const }
      : { kind: "login-required" as const, href: `/login?callbackUrl=${encodeURIComponent(`/skills/${skill.slug}`)}` };

  return (
    <article className="min-h-[70vh] bg-surface text-text-primary">
      <header className="bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
          <Link prefetch={false} href="/skills" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <ArrowLeft size={17} aria-hidden="true" />
            返回 Skills
          </Link>

          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end lg:gap-10">
            <div className="max-w-3xl">
              <h1 className="text-balance font-display text-3xl font-medium leading-tight tracking-[-0.04em] text-text-primary sm:text-4xl">{skill.title}</h1>
              <p className="mt-4 text-pretty text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">{skill.summary}</p>
              {skill.tags.length > 0 ? (
                <ul aria-label="Skill 標籤" className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-accent">
                  {skill.tags.slice(0, 3).map((tag) => <li key={tag}>#{tag}</li>)}
                </ul>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-muted">
                <span className="text-text-primary">目前可用</span>
                <Separator orientation="vertical" className="hidden h-4 w-px sm:block" />
                <span>{current.accessPolicy === "public" ? "公開 Skill" : "需要登入"}</span>
                <Separator orientation="vertical" className="hidden h-4 w-px sm:block" />
                <time dateTime={current.publishedAt.toISOString()}>發布於 {date(current.publishedAt)}</time>
              </div>
            </div>

            <SkillQuickActions distribution={current.distribution} installPrompt={installPrompt} agentPrompt={agentPrompt} download={download} />
          </div>

          {current.status === "deprecated" ? (
            <Alert variant="warning" className="mt-6 max-w-3xl leading-6">
              <AlertTitle>目前版本已棄用</AlertTitle>
              <AlertDescription className="mt-2">請確認是否仍要使用這個版本，並留意後續相容性。</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </header>

      <Separator />

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        {skill.bodyMarkdown.trim() ? (
          <section aria-labelledby="skill-content-heading">
            <h2 id="skill-content-heading" className="sr-only">Skill 內容</h2>
            <LibraryMarkdown content={skill.bodyMarkdown} />
          </section>
        ) : null}

        {!github ? <details className="group mt-10 rounded-xl border border-border-subtle bg-surface-muted px-4 sm:px-5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 outline-none marker:hidden transition-[color,transform] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-[0.995]">
            <span>
              <span className="block font-semibold text-text-primary">更新與檔案資訊</span>
              <span className="mt-0.5 block text-xs text-text-muted">變更說明、相容環境、授權與完整性</span>
            </span>
            <CaretDown size={18} className="shrink-0 text-text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <Separator />
          <div className="space-y-9 py-6">
            {current.changelogMarkdown.trim() ? (
              <section aria-labelledby="skill-changelog-heading">
                <h2 id="skill-changelog-heading" className="text-base font-semibold text-text-primary">更新說明</h2>
                <div className="mt-3">
                  <Markdown content={current.changelogMarkdown} demoteTopHeading />
                </div>
              </section>
            ) : null}
            <section aria-labelledby="skill-file-facts-heading">
              <h2 id="skill-file-facts-heading" className="text-base font-semibold text-text-primary">檔案資訊</h2>
              <div className="mt-4">
                <ReleaseFacts release={current} />
              </div>
            </section>
          </div>
        </details> : null}
      </div>
    </article>
  );
}
