import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { InformationForm } from "@/components/admin/library/information-form";
import { LibraryEditorForm } from "@/components/admin/library/library-editor-form";
import { LibraryLifecycleActions } from "@/components/admin/library/lifecycle-actions";
import { ReadinessPanel } from "@/components/admin/library/readiness-panel";
import { LibraryStatusBadge } from "@/components/admin/library/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  getLibraryEntry,
  getLibraryEntryReadiness,
} from "@/lib/services/library-service";
import {
  listInformation,
  validateInformationReadiness,
} from "@/lib/services/information-service";

function FailureNotice({ title, message, kind }: { title: string; message: string; kind: string }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/25 bg-danger-light p-4 text-sm text-danger">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}（{kind}）</p>
    </div>
  );
}

export default async function LibraryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entryResult = await getLibraryEntry(id);
  if (!entryResult.ok) {
    if (entryResult.kind === "not-found") notFound();
    return <FailureNotice title="Library 無法載入" message={entryResult.message} kind={entryResult.kind} />;
  }
  const entry = entryResult.value;
  const [libraryReadinessResult, informationListResult] = await Promise.all([
    getLibraryEntryReadiness(id),
    listInformation({ sourceType: "library_entry", sourceId: id }),
  ]);

  const informationItems = informationListResult.ok ? informationListResult.value : [];
  const targetSourceVersion = String(entry.status === "draft" ? entry.revision + 1 : entry.revision);
  const currentInformation = informationItems.find((item) => (
    item.status === "draft" && item.sourceVersion === targetSourceVersion
  ));
  const informationReadinessResult = currentInformation
    ? await validateInformationReadiness(currentInformation.id, {
      allowBundleSource: { sourceType: "library_entry", sourceId: entry.id },
    })
    : null;

  const libraryReady = libraryReadinessResult.ok && libraryReadinessResult.value.ready;
  const informationReady = Boolean(informationReadinessResult?.ok && informationReadinessResult.value.ready);
  const canPublish = entry.status === "draft" && libraryReady && informationReady && Boolean(currentInformation);
  const blockers = [
    ...(!libraryReadinessResult.ok ? [`Library readiness：${libraryReadinessResult.message}`] : []),
    ...(libraryReadinessResult.ok ? libraryReadinessResult.value.issues.map((issue) => `Library ${issue.field}：${issue.message}`) : []),
    ...(!currentInformation ? ["尚未建立符合目前 Library 修訂的 Information 草稿。"] : []),
    ...(informationReadinessResult && !informationReadinessResult.ok ? [`Information readiness：${informationReadinessResult.message}`] : []),
    ...(informationReadinessResult?.ok ? informationReadinessResult.value.issues.map((issue) => `Information ${issue.field}：${issue.message}`) : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link prefetch={false} href="/admin/library" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          返回 Library
        </Link>
        <PageHeader
          eyebrow={`Revision ${entry.revision}`}
          title={entry.title}
          description={entry.summary}
          actions={<LibraryStatusBadge status={entry.status} />}
          className="mb-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {libraryReadinessResult.ok ? (
          <ReadinessPanel title="Library readiness" ready={libraryReadinessResult.value.ready} issues={libraryReadinessResult.value.issues} />
        ) : (
          <FailureNotice title="Library readiness 無法取得" message={libraryReadinessResult.message} kind={libraryReadinessResult.kind} />
        )}
        {currentInformation && informationReadinessResult?.ok ? (
          <ReadinessPanel title="Information readiness" ready={informationReadinessResult.value.ready} issues={informationReadinessResult.value.issues} />
        ) : informationReadinessResult && !informationReadinessResult.ok ? (
          <FailureNotice title="Information readiness 無法取得" message={informationReadinessResult.message} kind={informationReadinessResult.kind} />
        ) : (
          <section className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="font-semibold text-text-primary">Information readiness</h2>
            <p className="mt-3 text-sm text-text-muted">尚無符合目標來源修訂 {targetSourceVersion} 的 Information 草稿。</p>
          </section>
        )}
      </div>

      {!informationListResult.ok && (
        <FailureNotice title="Information 清單無法載入" message={informationListResult.message} kind={informationListResult.kind} />
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8" aria-labelledby="library-content-title">
        <h2 id="library-content-title" className="mb-2 text-lg font-semibold text-text-primary">Library 內容</h2>
        <p className="mb-6 text-sm text-text-muted">
          {entry.status === "draft"
            ? "每次儲存都會增加 revision；請在最後一次儲存後建立 Information。"
            : entry.status === "published"
              ? "可直接修正已發佈內容；公開網址與發佈狀態不會改變。"
              : "已下架內容目前不可直接修改。"}
        </p>
        {entry.status !== "withdrawn" ? (
          <LibraryEditorForm entry={{
            id: entry.id,
            slug: entry.slug,
            title: entry.title,
            summary: entry.summary,
            bodyMarkdown: entry.bodyMarkdown,
            tags: entry.tags,
            featured: entry.featured,
            revision: entry.revision,
            status: entry.status,
          }} />
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div><dt className="text-text-muted">Slug</dt><dd className="mt-1 font-mono text-text-primary">{entry.slug}</dd></div>
            <div><dt className="text-text-muted">標籤</dt><dd className="mt-1 text-text-primary">{entry.tags.join("、") || "無"}</dd></div>
            <div><dt className="text-text-muted">發佈時間</dt><dd className="mt-1 text-text-primary">{entry.publishedAt?.toLocaleString("zh-TW") ?? "—"}</dd></div>
            <div><dt className="text-text-muted">下架時間</dt><dd className="mt-1 text-text-primary">{entry.withdrawnAt?.toLocaleString("zh-TW") ?? "—"}</dd></div>
          </dl>
        )}
        {entry.status === "published" && (
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border-subtle pt-6 text-sm md:grid-cols-2">
            <div><dt className="text-text-muted">公開網址</dt><dd className="mt-1 font-mono text-text-primary">/library/{entry.slug}</dd></div>
            <div><dt className="text-text-muted">發佈時間</dt><dd className="mt-1 text-text-primary">{entry.publishedAt?.toLocaleString("zh-TW") ?? "—"}</dd></div>
          </dl>
        )}
      </section>

      {entry.status === "draft" && (
        <section className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8" aria-labelledby="information-editor-title">
          <h2 id="information-editor-title" className="text-lg font-semibold text-text-primary">發佈所需 Information</h2>
          <p className="mb-6 mt-2 text-sm text-text-muted">目標來源 revision：{targetSourceVersion}。若再修改 Library，請為新的來源 revision 建立 Information。</p>
          <InformationForm
            entryId={entry.id}
            defaultTitle={entry.title}
            defaultSummary={entry.summary}
            defaultTags={entry.tags}
            information={currentInformation ? {
              id: currentInformation.id,
              title: currentInformation.title,
              summary: currentInformation.summary,
              whyItMatters: currentInformation.whyItMatters,
              tags: currentInformation.tags,
              revision: currentInformation.revision,
            } : undefined}
          />
        </section>
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8" aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title" className="mb-4 text-lg font-semibold text-text-primary">Lifecycle 動作</h2>
        <LibraryLifecycleActions
          entryId={entry.id}
          title={entry.title}
          revision={entry.revision}
          status={entry.status}
          canPublish={canPublish}
          publishBlockers={blockers}
          informationId={currentInformation?.id}
          informationRevision={currentInformation?.revision}
          idempotencyKey={`admin-library-publish-${entry.id}-${entry.revision}-${currentInformation?.revision ?? "none"}`}
        />
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8" aria-labelledby="information-history-title">
        <h2 id="information-history-title" className="text-lg font-semibold text-text-primary">Information 狀態</h2>
        {informationItems.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">尚未建立任何 Information。</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle">
            {informationItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <p className="mt-1 font-mono text-xs text-text-muted">source {item.sourceVersion} · revision {item.revision}</p>
                </div>
                <LibraryStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
