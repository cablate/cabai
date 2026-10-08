"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDown, CaretUp, MagnifyingGlass } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  TrackingSort,
  TrackingSortDirection,
  TrackingUserSummary,
} from "@/lib/services/tracking-query-service";

export type TrackingUserRow = TrackingUserSummary;

interface TrackingTableProps {
  data: TrackingUserRow[];
  filteredCount: number;
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  search: string;
  sort: TrackingSort;
  direction: TrackingSortDirection;
  nextCursor: string | null;
  previousCursor: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "頁面瀏覽",
  product_viewed: "商品瀏覽",
  lesson_started: "課程開始",
  purchase_completed: "購買完成",
  purchase_refunded: "退款",
  subscription_canceled: "訂閱取消",
  discord_linked: "Discord 連結",
  discord_unlinked: "Discord 取消連結",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "-";
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  try {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds} 秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return formatDateTime(iso);
  } catch {
    return "-";
  }
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function trackingHref(options: {
  search: string;
  sort: TrackingSort;
  direction: TrackingSortDirection;
  cursor?: string | null;
  page?: number;
  edge?: "first" | "last";
}): string {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  params.set("sort", options.sort);
  params.set("direction", options.direction);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.edge === "last") params.set("edge", "last");
  if (options.page && options.page > 1) params.set("page", String(options.page));
  return `/admin/tracking?${params.toString()}`;
}

function SortHeading({
  field,
  label,
  activeSort,
  direction,
  href,
}: {
  field: TrackingSort;
  label: string;
  activeSort: TrackingSort;
  direction: TrackingSortDirection;
  href: string;
}) {
  const active = field === activeSort;
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted"
    >
      <Link
        prefetch={false}
        href={href}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-left transition-[background-color,color,transform] hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
      >
        {label}
        {active && direction === "asc" ? <CaretUp size={12} /> : <CaretDown size={12} className={active ? undefined : "opacity-40"} />}
      </Link>
    </th>
  );
}

export function TrackingTable({
  data,
  filteredCount,
  pageIndex,
  pageCount,
  pageSize,
  search: searchParam,
  sort,
  direction,
  nextCursor,
  previousCursor,
}: TrackingTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState(searchParam);

  useEffect(() => {
    const normalized = normalizeSearch(search);
    if (normalized === normalizeSearch(searchParam)) return;
    const timeout = window.setTimeout(() => {
      router.replace(trackingHref({ search: normalized, sort, direction }), { scroll: false });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [direction, router, search, searchParam, sort]);

  const sortHref = (field: TrackingSort) => trackingHref({
    search: normalizeSearch(searchParam),
    sort: field,
    direction: field === sort && direction === "desc" ? "asc" : "desc",
  });
  const firstHref = trackingHref({ search: normalizeSearch(searchParam), sort, direction });
  const previousHref = previousCursor
    ? trackingHref({ search: normalizeSearch(searchParam), sort, direction, cursor: previousCursor, page: pageIndex - 1 })
    : null;
  const nextHref = nextCursor
    ? trackingHref({ search: normalizeSearch(searchParam), sort, direction, cursor: nextCursor, page: pageIndex + 1 })
    : null;
  const lastHref = trackingHref({ search: normalizeSearch(searchParam), sort, direction, edge: "last", page: pageCount });

  return (
    <div className="space-y-4">
      <div className="relative flex-1 sm:max-w-xs">
        <Input
          type="search"
          aria-label="搜尋用戶名稱或 Email..."
          placeholder="搜尋用戶名稱或 Email..."
          value={search}
          maxLength={120}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">用戶</th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">最近活動</th>
                <SortHeading
                  field="lastActiveAt"
                  label="活動時間"
                  activeSort={sort}
                  direction={direction}
                  href={sortHref("lastActiveAt")}
                />
                <SortHeading
                  field="eventCount"
                  label="次數"
                  activeSort={sort}
                  direction={direction}
                  href={sortHref("eventCount")}
                />
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">Discord</th>
                <SortHeading
                  field="createdAt"
                  label="註冊時間"
                  activeSort={sort}
                  direction={direction}
                  href={sortHref("createdAt")}
                />
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-text-muted">
                    {searchParam ? "找不到符合的用戶" : "尚無用戶"}
                  </td>
                </tr>
              ) : data.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-muted">
                  <td className="px-6 py-4">
                    <Link prefetch={false} href={`/admin/tracking/${row.id}`} className="block">
                      <span className="font-medium text-text-primary transition-colors hover:text-accent">
                        {row.name || "未命名"}
                      </span>
                      <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                        {row.role === "admin" ? "管理員" : "會員"}
                      </span>
                      <p className="mt-0.5 text-xs text-text-muted">{row.email ?? "-"}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    {row.latestEventType ? (
                      <Badge variant="info">{EVENT_LABELS[row.latestEventType] ?? row.latestEventType}</Badge>
                    ) : <span className="text-text-muted">無記錄</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className="text-text-secondary"
                      title={row.latestEventTime ? formatDateTime(row.latestEventTime) : ""}
                    >
                      {row.latestEventTime ? timeAgo(row.latestEventTime) : "-"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-text-secondary">{row.eventCount}</td>
                  <td className="px-6 py-4">
                    {row.discordLinked ? <Badge variant="success">已連結</Badge> : row.discordEver ? <Badge variant="default">已斷開</Badge> : <span className="text-text-muted">-</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-xs text-text-muted">{formatDateTime(row.createdAt)}</td>
                  <td className="px-6 py-4">
                    <Link
                      prefetch={false}
                      href={`/admin/tracking/${row.id}`}
                      className="text-xs font-medium text-text-muted transition-colors hover:text-accent"
                    >
                      查看 &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">
            共 {filteredCount} 筆，第 {pageIndex}/{pageCount} 頁（每頁最多 {pageSize} 筆）
          </span>
          <div className="flex items-center gap-1">
            {pageIndex <= 1 ? (
              <Button variant="ghost" size="sm" disabled aria-label="第一頁">&laquo;</Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link prefetch={false} href={firstHref} aria-label="第一頁">&laquo;</Link>
              </Button>
            )}
            {previousHref ? (
              <Button asChild variant="ghost" size="sm">
                <Link prefetch={false} href={previousHref}>上一頁</Link>
              </Button>
            ) : <Button variant="ghost" size="sm" disabled>上一頁</Button>}
            {nextHref ? (
              <Button asChild variant="ghost" size="sm">
                <Link prefetch={false} href={nextHref}>下一頁</Link>
              </Button>
            ) : <Button variant="ghost" size="sm" disabled>下一頁</Button>}
            {pageIndex >= pageCount ? (
              <Button variant="ghost" size="sm" disabled aria-label="最後一頁">&raquo;</Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link prefetch={false} href={lastHref} aria-label="最後一頁">&raquo;</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
