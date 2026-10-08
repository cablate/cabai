import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states/empty-state";
import { ErrorState } from "@/components/ui/states/error-state";
import {
  listAdminInformationPage,
  type AdminInformationListFilters,
} from "@/lib/services/information-service";
import {
  hasInformationListFilters,
  informationListHref,
  parseInformationListSearchParams,
  type InformationListSearchParams,
} from "./information-list-query";
import { CopySourceIdButton } from "./copy-source-id-button";

const sourceLabels = {
  manual_announcement: "一般公告",
  library_entry: "資源文章",
  skill_release: "Skill 發布",
  course: "課程",
  api_operation: "API 功能",
} as const;

const audienceLabels = {
  all_users: "所有使用者",
  source_entitled: "具內容權限者",
} as const;

const statusOptions: Array<[string, string]> = [
  ["", "全部狀態"],
  ["draft", "草稿"],
  ["published", "已發布"],
  ["withdrawn", "已撤回"],
];
const sourceOptions: Array<[string, string]> = [["", "全部來源"], ...Object.entries(sourceLabels)];
const audienceOptions: Array<[string, string]> = [["", "全部對象"], ...Object.entries(audienceLabels)];
const sortOptions: Array<[string, string]> = [
  ["updated_desc", "最近更新"],
  ["updated_asc", "最早更新"],
  ["published_desc", "最近發布"],
];

const kindLabels: Record<string, string> = {
  "manual.announcement": "一般公告",
  "library.published": "資源發布",
  "library.updated": "資源更新",
  "skill.released": "Skill 發布",
  "skill.deprecated": "Skill 停用",
  "course.announced": "課程公告",
  "course.published": "課程發布",
  "api.capability-added": "API 功能更新",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(value);
}

function displayStatus(
  item: { status: string; expiresAt: Date | null },
  now: Date,
): { label: string; variant: "default" | "success" | "warning" } {
  if (item.status === "published" && item.expiresAt && item.expiresAt <= now) {
    return { label: "已到期", variant: "default" };
  }
  if (item.status === "published") return { label: "已發布", variant: "success" };
  if (item.status === "draft") return { label: "草稿", variant: "warning" };
  return { label: "已撤回", variant: "default" };
}

function clearedFiltersHref(filters: AdminInformationListFilters): string {
  return informationListHref(filters, {
    query: undefined,
    status: undefined,
    sourceType: undefined,
    audience: undefined,
    sort: "updated_desc",
    page: 1,
  });
}

export default async function InformationPage({
  searchParams,
}: {
  searchParams: Promise<InformationListSearchParams>;
}) {
  const filters = parseInformationListSearchParams(await searchParams);
  const now = new Date();
  const result = await listAdminInformationPage(filters, now);
  const filtered = hasInformationListFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Information 管理"
        description="查找目前發布、待處理與歷史內容。詳細版本與品質檢查會在下一階段整理。"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link prefetch={false} href="/admin/information/coverage">檢查覆蓋狀態</Link>
            </Button>
            <Button asChild>
              <Link prefetch={false} href="/admin/information/new">建立 Information</Link>
            </Button>
          </div>
        )}
      />

      <nav className="flex flex-wrap gap-2" aria-label="Information 工作檢視">
        {([
          ["active", "待處理與發布"],
          ["history", "歷史"],
          ["all", "全部"],
        ] as const).map(([view, label]) => (
          <Button
            key={view}
            asChild
            size="sm"
            variant={filters.view === view ? "primary" : "secondary"}
          >
            <Link prefetch={false}
              href={informationListHref(filters, { view, page: 1 })}
              aria-current={filters.view === view ? "page" : undefined}
            >
              {label}
            </Link>
          </Button>
        ))}
      </nav>

      <form
        method="get"
        className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.5fr)_repeat(4,minmax(9rem,1fr))_auto]"
      >
        <input type="hidden" name="view" value={filters.view} />
        <label className="space-y-1.5 text-sm font-medium text-text-secondary">
          <span>搜尋</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.query}
            placeholder="標題、摘要、來源 ID 或種類"
            className="min-h-10 w-full rounded-md border border-border bg-surface px-3 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <FilterSelect
          label="狀態"
          name="status"
          value={filters.status}
          options={statusOptions}
        />
        <FilterSelect
          label="來源"
          name="sourceType"
          value={filters.sourceType}
          options={sourceOptions}
        />
        <FilterSelect
          label="對象"
          name="audience"
          value={filters.audience}
          options={audienceOptions}
        />
        <FilterSelect
          label="排序"
          name="sort"
          value={filters.sort}
          options={sortOptions}
        />
        <div className="flex items-end gap-2">
          <Button type="submit" className="w-full xl:w-auto">套用</Button>
          {filtered && (
            <Button asChild variant="ghost" className="w-full xl:w-auto">
              <Link prefetch={false} href={clearedFiltersHref(filters)}>清除</Link>
            </Button>
          )}
        </div>
      </form>

      {!result.ok ? (
        <ErrorState title="Information 載入失敗" description={result.message} />
      ) : result.value.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            title={filtered ? "找不到符合條件的內容" : filters.view === "history" ? "目前沒有歷史內容" : "目前沒有待處理或發布中的內容"}
            description={filtered ? "請調整搜尋或篩選條件。" : "建立新內容後會出現在這裡。"}
            action={filtered
              ? { label: "清除篩選", href: clearedFiltersHref(filters) }
              : filters.view === "active"
                ? { label: "建立 Information", href: "/admin/information/new" }
                : undefined}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-muted">
            <p>共 {result.value.totalItems} 筆，第 {result.value.page} / {result.value.totalPages} 頁</p>
            <p>每頁最多 {result.value.pageSize} 筆</p>
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-text-secondary">
                <tr>
                  <th className="p-4 font-medium">內容</th>
                  <th className="p-4 font-medium">來源</th>
                  <th className="p-4 font-medium">對象</th>
                  <th className="p-4 font-medium">狀態</th>
                  <th className="p-4 font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.value.items.map((item) => {
                  const status = displayStatus(item, now);
                  return (
                    <tr key={item.id} className="align-top transition-colors hover:bg-surface-muted/60">
                      <td className="p-4">
                        <Link prefetch={false} className="font-semibold text-text-primary hover:text-accent hover:underline" href={`/admin/information/${item.id}`}>
                          {item.title}
                        </Link>
                        <p className="mt-1 max-w-xl text-text-muted">{item.summary}</p>
                        <p className="mt-2 text-xs text-text-muted">{kindLabels[item.kind] ?? item.kind} · 第 {item.revision} 版</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-text-secondary">{sourceLabels[item.sourceType]}</p>
                        <details className="mt-2 max-w-xs">
                          <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary">查看來源 ID</summary>
                          <code className="mt-1 block break-all text-xs text-text-muted">{item.sourceId}</code>
                          <CopySourceIdButton value={item.sourceId} />
                        </details>
                      </td>
                      <td className="p-4 text-text-secondary">{audienceLabels[item.audience]}</td>
                      <td className="p-4"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="p-4 whitespace-nowrap text-text-muted">{formatDate(item.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {result.value.items.map((item) => {
              const status = displayStatus(item, now);
              return (
                <article key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link prefetch={false} className="font-semibold text-text-primary hover:text-accent hover:underline" href={`/admin/information/${item.id}`}>
                        {item.title}
                      </Link>
                      <p className="mt-1 text-sm text-text-muted">{item.summary}</p>
                    </div>
                    <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                    <div>
                      <dt className="text-text-muted">來源</dt>
                      <dd className="mt-1 font-medium text-text-secondary">{sourceLabels[item.sourceType]}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">對象</dt>
                      <dd className="mt-1 font-medium text-text-secondary">{audienceLabels[item.audience]}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">種類</dt>
                      <dd className="mt-1 font-medium text-text-secondary">{kindLabels[item.kind] ?? item.kind}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">最近更新</dt>
                      <dd className="mt-1 font-medium text-text-secondary">{formatDate(item.updatedAt)}</dd>
                    </div>
                  </dl>
                  <details className="mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer text-xs text-text-muted">查看來源 ID</summary>
                    <code className="mt-1 block break-all text-xs text-text-muted">{item.sourceId}</code>
                    <CopySourceIdButton value={item.sourceId} />
                  </details>
                </article>
              );
            })}
          </div>

          {result.value.totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label="Information 分頁">
              {result.value.page > 1 ? (
                <Button asChild variant="secondary">
                  <Link prefetch={false} href={informationListHref(filters, { page: result.value.page - 1 })}>上一頁</Link>
                </Button>
              ) : <span />}
              {result.value.page < result.value.totalPages && (
                <Button asChild variant="secondary">
                  <Link prefetch={false} href={informationListHref(filters, { page: result.value.page + 1 })}>下一頁</Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-text-secondary">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="min-h-10 w-full rounded-md border border-border bg-surface px-3 text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || "all"} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
