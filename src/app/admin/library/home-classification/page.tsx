import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getPublishedPlanPresentations } from "@/lib/plan-presentations";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";
import { listPublicSkills } from "@/lib/services/skill-release-service";
import {
  buildHomeFreeResourceShadow,
  classifyHomeFreeResources,
  type HomeFreeResourceTarget,
} from "@/lib/services/home-free-resource-projection";

const targetLabels: Record<HomeFreeResourceTarget, string> = {
  products: "保留在 Products",
  "library-reauthor": "重寫為 Library",
  skills: "移至 Skills",
  suppress: "不在首頁顯示",
};

export default async function HomeClassificationPage() {
  const [legacyItems, libraryResult, skillResult] = await Promise.all([
    getPublishedPlanPresentations(),
    listPublishedLibraryEntries(),
    listPublicSkills({ authenticated: false }),
  ]);
  const libraries = libraryResult.ok ? libraryResult.value : [];
  const skills = skillResult.ok ? skillResult.value : [];
  const preview = classifyHomeFreeResources(legacyItems, { libraries, skills });
  const shadow = buildHomeFreeResourceShadow({ preview, libraries, skills });

  return (
    <div className="space-y-8">
      <PageHeader
        title="首頁免費資源分類預覽"
        description="只讀比較舊首頁來源與 Library／Skills 投影；這一頁不會搬資料、發布內容或產生未讀 Information。"
        actions={(
          <Link prefetch={false} href="/admin/library" className="inline-flex min-h-10 items-center rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-secondary hover:text-text-primary">
            返回 Library
          </Link>
        )}
      />

      {(!libraryResult.ok || !skillResult.ok) && (
        <div role="alert" className="rounded-xl border border-warning/25 bg-warning-light p-5 text-sm text-warning">
          Canonical projection 未完整載入；目前預覽不允許作為 cutover 證據。
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="分類摘要">
        {(Object.entries(preview.counts) as Array<[HomeFreeResourceTarget, number]>).map(([target, count]) => (
          <article key={target} className="rounded-xl border border-border-subtle bg-surface p-5">
            <p className="text-sm text-text-muted">{targetLabels[target]}</p>
            <p className="mt-2 text-3xl font-semibold text-text-primary">{count}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Shadow comparison</h2>
            <p className="mt-1 text-sm text-text-secondary">新投影必須沒有遺漏與重複 URL，且每個重新分類都要有 owner 決策。</p>
          </div>
          <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold uppercase text-text-secondary">
            {shadow.comparison.status}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-text-muted">舊首頁項目</dt><dd className="mt-1 font-semibold">{shadow.legacy.length}</dd></div>
          <div><dt className="text-text-muted">新投影項目</dt><dd className="mt-1 font-semibold">{shadow.projected.length}</dd></div>
          <div><dt className="text-text-muted">缺少對應內容</dt><dd className="mt-1 font-semibold">{shadow.comparison.missingPlanIds.length}</dd></div>
          <div><dt className="text-text-muted">重複公開 URL</dt><dd className="mt-1 font-semibold">{shadow.comparison.duplicatePublicUrls.length}</dd></div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-6 py-5">
          <h2 className="text-xl font-semibold text-text-primary">逐項分類</h2>
          <p className="mt-1 text-sm text-text-secondary">預設一律保留原 Product owner，避免系統自行猜測內容應搬去哪裡。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-border-subtle">
              <th className="px-6 py-3 text-xs text-text-muted" scope="col">項目</th>
              <th className="px-6 py-3 text-xs text-text-muted" scope="col">原 owner</th>
              <th className="px-6 py-3 text-xs text-text-muted" scope="col">目前建議</th>
              <th className="px-6 py-3 text-xs text-text-muted" scope="col">重複訊號</th>
              <th className="px-6 py-3 text-xs text-text-muted" scope="col">公開位置</th>
            </tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {preview.rows.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-text-muted">目前沒有舊首頁免費項目需要分類。</td></tr>}
              {preview.rows.map((row) => (
                <tr key={row.legacyPlanId}>
                  <td className="px-6 py-4 font-medium text-text-primary">{row.title}</td>
                  <td className="px-6 py-4 text-text-secondary">{row.originalOwner}</td>
                  <td className="px-6 py-4 text-text-secondary">{targetLabels[row.effectiveTarget]}</td>
                  <td className="px-6 py-4 text-text-secondary">{row.duplicates.length || "無"}</td>
                  <td className="px-6 py-4"><Link prefetch={false} href={row.originalPublicUrl} className="text-accent hover:text-success">{row.originalPublicUrl}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
