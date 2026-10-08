import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { users, eventsRaw, userDiscordLinks } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";

// ─── Constants ───

const PAGE_SIZE = 30;

const EVENT_CONFIG: Record<
  string,
  { label: string; variant: "info" | "success" | "warning" | "danger" | "default" }
> = {
  page_view: { label: "頁面瀏覽", variant: "default" },
  product_viewed: { label: "商品瀏覽", variant: "info" },
  lesson_started: { label: "課程開始", variant: "info" },
  purchase_completed: { label: "購買完成", variant: "success" },
  purchase_refunded: { label: "退款", variant: "danger" },
  subscription_canceled: { label: "訂閱取消", variant: "warning" },
  discord_linked: { label: "Discord 連結", variant: "success" },
  discord_unlinked: { label: "Discord 取消連結", variant: "default" },
};

// ─── Helpers ───

function formatDateTime(date: Date | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Render event properties as human-readable text for common event types.
 */
function EventProperties({
  eventType,
  properties,
}: {
  eventType: string;
  properties: Record<string, unknown> | null;
}) {
  if (!properties || Object.keys(properties).length === 0) return null;

  switch (eventType) {
    case "page_view": {
      const path = properties.path as string | undefined;
      return (
        <code className="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs text-text-secondary">
          {path ?? "?"}
        </code>
      );
    }
    case "product_viewed": {
      const name = properties.planName as string | undefined;
      const type = properties.offeringType as string | undefined;
      return (
        <span className="text-xs text-text-secondary">
          {name ?? "?"}
          {type && <span className="ml-1.5 text-text-muted">({type})</span>}
        </span>
      );
    }
    case "lesson_started": {
      const title = properties.lessonTitle as string | undefined;
      const ltype = properties.lessonType as string | undefined;
      return (
        <span className="text-xs text-text-secondary">
          <span>{title ?? "?"}</span>
          {ltype && <span className="ml-1.5 text-text-muted">({ltype})</span>}
        </span>
      );
    }
    case "purchase_completed": {
      const planName = properties.planName as string | undefined;
      const source = properties.source as string | undefined;
      const type = properties.type as string | undefined;
      const parts: string[] = [];
      if (planName) parts.push(planName);
      if (type) parts.push(type === "subscription" ? "訂閱" : "單次");
      if (source) parts.push(`來源: ${source}`);
      return <span className="text-xs text-text-secondary">{parts.join(" · ") || "?"}</span>;
    }
    case "purchase_refunded":
    case "subscription_canceled": {
      const pid = properties.planId as string | undefined;
      return <span className="text-xs text-text-secondary">{pid ? `方案: ${pid}` : ""}</span>;
    }
    case "discord_linked":
      return (
        <span className="text-xs text-text-secondary">
          {(properties.discordUsername as string) || "已連結 Discord"}
        </span>
      );
    case "discord_unlinked":
      return (
        <span className="text-xs text-text-secondary">
          {(properties.discordUsername as string) || "已取消 Discord 連結"}
        </span>
      );
  }

  // Fallback: show raw JSON
  return (
    <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-muted p-2 text-xs text-text-secondary">
      {JSON.stringify(properties, null, 2)}
    </pre>
  );
}

// ─── Pagination link builder ───

function buildPaginationHref(
  userId: string,
  page: number,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/tracking/${userId}${query ? `?${query}` : ""}`;
}

// ─── Page ───

interface UserTrackingPageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function UserTrackingPage({
  params,
  searchParams,
}: UserTrackingPageProps) {
  const { userId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) notFound();

  const [[totalResult], events, discordLink] = await Promise.all([
    db
      .select({ total: count() })
      .from(eventsRaw)
      .where(eq(eventsRaw.userId, userId)),
    db
      .select()
      .from(eventsRaw)
      .where(eq(eventsRaw.userId, userId))
      .orderBy(desc(eventsRaw.occurredAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.query.userDiscordLinks.findFirst({
      where: eq(userDiscordLinks.userId, userId),
    }),
  ]);

  const totalEvents = Number(totalResult?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-text-muted">
        <Link prefetch={false}
          href="/admin/tracking"
          className="transition-colors hover:text-text-primary"
        >
          &larr; 用戶軌跡
        </Link>
      </nav>

      {/* User info card */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary">
                {user.name || "未命名"}
              </h1>
              <Badge variant={user.role === "admin" ? "warning" : "default"}>
                {user.role === "admin" ? "管理員" : "會員"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-text-muted">{user.email ?? "-"}</p>
          </div>
          <div className="text-right text-xs text-text-muted">
            <div>註冊：{formatDateTime(user.createdAt)}</div>
            <div className="mt-0.5">
              上次活躍：
              {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "無記錄"}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
          <span>活動總數：{totalEvents}</span>
          <span>
            目前顯示：第 {Math.min(offset + 1, totalEvents)}–{Math.min(offset + PAGE_SIZE, totalEvents)} 筆
          </span>
          {discordLink && (
            <>
              <span>Discord：{discordLink.discordUsername ?? discordLink.discordId}</span>
              <span>連結時間：{formatDateTime(discordLink.linkedAt)}</span>
              {discordLink.unlinkedAt && (
                <span>斷開時間：{formatDateTime(discordLink.unlinkedAt)}</span>
              )}
              <span>狀態：{discordLink.unlinkedAt ? "已斷開" : "已連結"}</span>
            </>
          )}
        </div>
      </div>

      {/* Event timeline */}
      <div className="rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">活動時間線</h2>
          {totalPages > 1 && (
            <span className="text-xs text-text-muted">
              第 {page} / {totalPages} 頁
            </span>
          )}
        </div>

        {totalEvents === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-text-muted">此用戶尚無任何活動記錄。</p>
            <p className="mt-1 text-xs text-text-muted">
              用戶登入並操作後，軌跡會自動開始記錄（頁面瀏覽、商品瀏覽、課程觀看等）。
            </p>
          </div>
        ) : (
          <div className="px-6 py-4">
            {events.map((event) => {
              const cfg = EVENT_CONFIG[event.eventType] ?? {
                label: event.eventType,
                variant: "default" as const,
              };
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-muted"
                >
                  {/* Time column */}
                  <div className="shrink-0 pt-0.5 text-right font-mono text-[11px] text-text-muted/60">
                    {new Intl.DateTimeFormat("zh-TW", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    }).format(event.occurredAt)}
                  </div>

                  {/* Vertical divider dot */}
                  <div className="shrink-0 pt-1.5">
                    <div className="h-2 w-2 rounded-full border border-border-subtle bg-surface" />
                  </div>

                  {/* Event content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                        {event.source}
                      </span>
                      <EventProperties
                        eventType={event.eventType}
                        properties={event.properties as Record<string, unknown> | null}
                      />
                    </div>
                    {Math.abs(event.createdAt.getTime() - event.occurredAt.getTime()) > 1000 && (
                      <p className="mt-1 text-[11px] text-text-muted">
                        寫入時間：{formatDateTime(event.createdAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border-subtle px-6 py-3">
            <span className="text-xs text-text-muted">
              共 {totalEvents} 筆
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildPaginationHref(userId, page - 1)}
                  className="inline-flex rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  上一頁
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildPaginationHref(userId, page + 1)}
                  className="inline-flex rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  下一頁
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
