import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ArtifactUpload, PublicationPanel, ReleaseForm } from "@/components/admin/skills/admin-skill-forms";
import { listInformation, validateInformationReadiness } from "@/lib/services/information-service";
import { getAdminSkillProjection, getAdminSkillRelease, getSkillReadiness, getSkillReleaseReadiness } from "@/lib/services/skill-release-service";
import type { DomainResult, ReadinessResult } from "@/lib/services/library-skill-information-domain";

function statusMeta(status: string): { label: string; variant: "default" | "success" | "warning" | "danger" | "info" } {
  switch (status) {
    case "published": return { label: "已發布", variant: "success" };
    case "deprecated": return { label: "已棄用", variant: "warning" };
    case "withdrawn": return { label: "已撤下", variant: "warning" };
    default: return { label: "草稿", variant: "default" };
  }
}

function readinessText(result: DomainResult<ReadinessResult>): { ready: boolean; label: string } {
  if (!result.ok) return { ready: false, label: "無法確認" };
  return result.value.ready ? { ready: true, label: "已完成" } : { ready: false, label: "待處理" };
}

function ReadinessCard({ label, result }: { label: string; result: DomainResult<ReadinessResult> }) {
  const state = readinessText(result);
  return (
    <div className="rounded-lg bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <Badge variant={state.ready ? "success" : "warning"}>{state.label}</Badge>
      </div>
      {!result.ok ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-danger">{result.message}</p>
      ) : result.value.ready ? (
        <p className="mt-2 text-sm text-success">已符合發布條件。</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-danger">
          {result.value.issues.map((issue) => (
            <li key={`${issue.field}:${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressStep({ number, title, state, description }: { number: string; title: string; state: { ready: boolean; label: string }; description: string }) {
  return (
    <li className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-accent">{number}</span>
        <Badge variant={state.ready ? "success" : "default"}>{state.label}</Badge>
      </div>
      <h3 className="mt-4 font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
    </li>
  );
}

export default async function ReleaseDetailPage({ params }: { params: Promise<{ id: string; releaseId: string }> }) {
  const { id, releaseId } = await params;
  const [projection, releaseResult, skillReady, releaseReady, informationResult] = await Promise.all([
    getAdminSkillProjection(id), getAdminSkillRelease(releaseId), getSkillReadiness(id),
    getSkillReleaseReadiness(releaseId), listInformation({ sourceType: "skill_release", sourceId: releaseId }),
  ]);
  if ((!projection.ok && projection.kind === "not-found") || (!releaseResult.ok && releaseResult.kind === "not-found")) notFound();
  if (!projection.ok) return <div role="alert" className="text-danger">{projection.message}</div>;
  if (!releaseResult.ok) return <div role="alert" className="text-danger">{releaseResult.message}</div>;
  const release = releaseResult.value;
  if (release.skillId !== id) notFound();
  const information = informationResult.ok ? informationResult.value[0] : undefined;
  const informationReady = information?.status === "draft"
    ? await validateInformationReadiness(information.id, { allowBundleSource: { sourceType: "skill_release", sourceId: releaseId } })
    : null;
  const prerequisitesReady = Boolean(skillReady.ok && skillReady.value.ready && releaseReady.ok && releaseReady.value.ready);
  const manifest = release.artifactManifest;
  const releaseStatus = statusMeta(release.status);
  const informationState = information
    ? information.status === "published"
      ? { ready: true, label: "已發布" }
      : informationReady?.ok && informationReady.value.ready
        ? { ready: true, label: "可發布" }
        : { ready: false, label: "待處理" }
    : { ready: false, label: "尚未建立" };

  return (
    <div className="space-y-8">
      <header>
        <Link prefetch={false} href={`/admin/skills/${id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-accent transition-colors hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">← {projection.value.skill.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-text-primary">Release {release.version}</h1><Badge variant={releaseStatus.variant}>{releaseStatus.label}</Badge></div>
        <p className="mt-2 text-sm text-text-secondary">{release.accessPolicy === "public" ? "公開使用" : "需登入／User Agent token"}</p>
      </header>

      <section className="rounded-xl border border-border-subtle bg-surface-muted p-5" aria-labelledby="release-flow-heading">
        <h2 id="release-flow-heading" className="text-sm font-semibold text-text-primary">發布進度</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProgressStep number="01" title="Skill 基本資料" state={readinessText(skillReady)} description="名稱、網址與摘要必須完整。" />
          <ProgressStep number="02" title="Release 內容" state={readinessText(releaseReady)} description="公開內容、相容性與授權必須可驗證。" />
          <ProgressStep number="03" title="ZIP 檔案" state={{ ready: Boolean(release.artifactValidation?.valid), label: release.artifactValidation?.valid ? "已驗證" : "待上傳" }} description="上傳後會檢查檔案與 checksum。" />
          <ProgressStep number="04" title="公告與發布" state={informationState} description="建立 Information 後，以同一個操作公開內容。" />
        </ol>
      </section>

      {release.status === "deprecated" && <div className="rounded-xl border border-warning/30 bg-warning-light p-4 text-sm leading-6 text-warning">此 Release 已標記為棄用。現有正式發布流程尚未提供與公告同步的棄用操作，因此請先確認替代內容與通知安排。</div>}

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary">Release 公開內容</h2>
        <p className="mb-5 text-sm leading-6 text-text-secondary">這裡設定公開頁的說明、存取方式與下載檔案的相容資訊。發布後會依既有規則鎖定。</p>
        {release.status === "draft" ? <ReleaseForm skillId={id} release={release} /> : <p className="text-sm text-text-secondary">這個 Release 已發布、棄用或撤下；內容目前依正式發布規則鎖定。</p>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">檔案與完整性</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-text-muted">已綁定檔案</dt><dd className="mt-1 text-text-primary">{release.artifactMediaId ?? "尚未綁定"}</dd></div>
          <div><dt className="text-text-muted">驗證狀態</dt><dd className="mt-1 text-text-primary">{release.artifactValidation?.valid ? "已驗證" : "尚未驗證或驗證失敗"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-text-muted">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-text-primary">{release.checksumSha256 ?? "尚無 checksum"}</dd></div>
          {manifest && <><div><dt className="text-text-muted">檔案數量</dt><dd className="mt-1">{manifest.fileCount}</dd></div><div><dt className="text-text-muted">解壓縮後大小</dt><dd className="mt-1">{manifest.uncompressedBytes} bytes</dd></div></>}
        </dl>
        {release.status === "draft" && <div className="mt-6 border-t border-border-subtle pt-6"><ArtifactUpload releaseId={releaseId} expectedRevision={release.revision} /></div>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">發布前檢查</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ReadinessCard label="Skill 基本資料" result={skillReady} />
          <ReadinessCard label="Release 與檔案" result={releaseReady} />
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary">公告與發布</h2>
        <p className="mb-5 text-sm leading-6 text-text-secondary">公告會告訴使用者與 Agent 有新的 Skill 可用；最後一步會把 Skill、Release 與公告一起發布。</p>
        {information && <p className="mb-5 rounded-lg bg-surface-muted px-4 py-3 text-sm text-text-secondary">目前公告：{information.title} · {information.status}{informationReady?.ok ? ` · ${informationReady.value.ready ? "可發布" : "尚待補齊"}` : ""}</p>}
        <PublicationPanel skillId={id} releaseId={releaseId} skillRevision={projection.value.skill.revision} releaseRevision={release.revision} prerequisitesReady={prerequisitesReady} information={information} />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-muted p-5 text-sm leading-6 text-text-secondary">
        撤下功能尚未在此頁提供，因為目前沒有可同時撤下 Skill／Release 與已發布公告的原子化正式流程。
      </section>
    </div>
  );
}
