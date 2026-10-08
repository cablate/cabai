import { PageHeader } from "@/components/ui/page-header";
import {
  listTrackingPage,
  TRACKING_PAGE_SIZE,
  type TrackingSort,
  type TrackingSortDirection,
} from "@/lib/services/tracking-query-service";
import { TrackingTable } from "./tracking-table";

interface TrackingPageProps {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    page?: string;
    edge?: string;
  }>;
}

function parseSort(value: string | undefined): TrackingSort {
  return value === "createdAt" || value === "eventCount" ? value : "lastActiveAt";
}

function parseDirection(value: string | undefined): TrackingSortDirection {
  return value === "asc" ? "asc" : "desc";
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export default async function TrackingPage({ searchParams }: TrackingPageProps) {
  const params = await searchParams;
  const search = params.q ?? "";
  const sort = parseSort(params.sort);
  const direction = parseDirection(params.direction);
  const result = await listTrackingPage({
    search,
    sort,
    direction,
    cursor: params.cursor,
    edge: params.edge === "last" ? "last" : "first",
    pageSize: TRACKING_PAGE_SIZE,
    // Keep the existing table's email display as an explicit, bounded include.
    includeEmail: true,
  });
  const pageCount = Math.max(1, Math.ceil(result.filteredCount / result.pageSize));
  const requestedPage = parsePage(params.page);
  const pageIndex = params.edge === "last"
    ? pageCount
    : result.cursorApplied
      ? Math.min(requestedPage, pageCount)
      : 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title="用戶軌跡"
        description="查看所有用戶的活動記錄與最近動態。可搜尋用戶名稱或 Email，並依活動、註冊時間或活動次數排序。"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-sm text-text-muted">用戶總數</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-text-primary">
            {result.totalUsers}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-sm text-text-muted">曾有活動</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-text-primary">
            {result.activeUsers}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-sm text-text-muted">7 天未活躍</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-text-primary">
            {result.inactiveUsers}
          </p>
        </div>
      </div>

      <TrackingTable
        key={search}
        data={result.items}
        filteredCount={result.filteredCount}
        pageIndex={pageIndex}
        pageCount={pageCount}
        pageSize={result.pageSize}
        search={search}
        sort={sort}
        direction={direction}
        nextCursor={result.nextCursor}
        previousCursor={result.previousCursor}
      />

      {result.totalUsers > 0 && result.activeUsers === 0 && (
        <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            目前尚無任何活動記錄。用戶登入並操作後，軌跡會自動開始記錄。
          </p>
        </div>
      )}
    </div>
  );
}
