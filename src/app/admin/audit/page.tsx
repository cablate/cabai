import { PageHeader } from "@/components/ui/page-header";
import { listAuditPage } from "@/lib/services/audit-query-service";

const ACTION_LABELS: Record<string, string> = {
  create: "建立",
  update: "更新",
  delete: "刪除",
  publish: "發佈",
  unpublish: "下架",
  grant_access: "授權",
  revoke_access: "撤銷",
  upload: "上傳",
  restore: "恢復",
};

const ACTOR_LABELS: Record<string, string> = {
  user: "使用者",
  agent: "AI Agent",
  system: "系統",
};

const ENTITY_LABELS: Record<string, string> = {
  course: "課程",
  chapter: "章節",
  lesson: "課堂",
  planPresentation: "展示頁",
  planContent: "交付內容",
  media: "媒體",
  userPurchase: "購買紀錄",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
  publish: "bg-amber-50 text-amber-700",
  unpublish: "bg-zinc-100 text-zinc-600",
  restore: "bg-violet-50 text-violet-700",
  grant_access: "bg-emerald-50 text-emerald-700",
  revoke_access: "bg-red-50 text-red-700",
};

interface AuditPageProps {
  searchParams: Promise<{
    cursor?: string;
    action?: string;
    entityType?: string;
    actorType?: string;
  }>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const pageSize = 50;
  const actorType = params.actorType && ["user", "agent", "system"].includes(params.actorType)
    ? params.actorType as "user" | "agent" | "system"
    : undefined;
  const { items: logs, nextCursor } = await listAuditPage({
    cursor: params.cursor,
    pageSize,
    action: params.action,
    entityType: params.entityType,
    actorType,
  });

  function getActorName(log: typeof logs[number]): string {
    if (log.actorType === "user") return log.actorName || log.actorEmail || log.actorId.slice(0, 8);
    if (log.actorType === "agent") return `Agent ${log.actorId.slice(0, 8)}`;
    return "System";
  }

  function formatTime(date: Date): string {
    return new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    }).format(date);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="操作紀錄"
        description="所有管理操作的審計日誌，包含使用者和 AI Agent 的操作歷史"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterLink
          label="全部"
          href="/admin/audit"
          active={!params.action && !params.entityType && !params.actorType}
        />
        <FilterLink
          label="AI Agent"
          href="/admin/audit?actorType=agent"
          active={params.actorType === "agent"}
        />
        <FilterLink
          label="建立"
          href="/admin/audit?action=create"
          active={params.action === "create"}
        />
        <FilterLink
          label="更新"
          href="/admin/audit?action=update"
          active={params.action === "update"}
        />
        <FilterLink
          label="刪除"
          href="/admin/audit?action=delete"
          active={params.action === "delete"}
        />
        <FilterLink
          label="發佈"
          href="/admin/audit?action=publish"
          active={params.action === "publish"}
        />
        <FilterLink
          label="課程"
          href="/admin/audit?entityType=course"
          active={params.entityType === "course"}
        />
        <FilterLink
          label="課堂"
          href="/admin/audit?entityType=lesson"
          active={params.entityType === "lesson"}
        />
        <FilterLink
          label="展示頁"
          href="/admin/audit?entityType=planPresentation"
          active={params.entityType === "planPresentation"}
        />
      </div>

      {/* Log table */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-white py-16 text-center">
          <p className="text-text-muted">尚無操作紀錄</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-hover text-left text-xs font-medium uppercase text-text-muted">
                <th className="px-4 py-3">時間</th>
                <th className="px-4 py-3">操作者</th>
                <th className="px-4 py-3">動作</th>
                <th className="px-4 py-3">對象</th>
                <th className="px-4 py-3">變更</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {logs.map((log) => {
                const changes = log.changes as Record<string, { before: unknown; after: unknown }> | null;
                const meta = log.metadata as Record<string, unknown> | null;

                return (
                  <tr key={log.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-muted">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          log.actorType === "agent"
                            ? "bg-violet-50 text-violet-700"
                            : log.actorType === "system"
                              ? "bg-zinc-100 text-zinc-600"
                              : "bg-blue-50 text-blue-700"
                        }`}>
                          {ACTOR_LABELS[log.actorType] || log.actorType}
                        </span>
                        <span className="text-text-secondary text-xs">
                          {getActorName(log)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        ACTION_COLORS[log.action] || "bg-zinc-100 text-zinc-600"
                      }`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-text-secondary text-xs">
                          {ENTITY_LABELS[log.entityType] || log.entityType}
                        </span>
                        {meta?.title ? (
                          <span className="ml-1.5 text-text-primary text-xs font-medium">
                            {String(meta.title)}
                          </span>
                        ) : null}
                        <span className="ml-1.5 font-mono text-[10px] text-text-muted">
                          {log.entityId.slice(0, 8)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {changes ? (
                        <div className="space-y-0.5">
                          {Object.entries(changes).map(([field, { before, after }]) => (
                            <div key={field} className="text-xs">
                              <span className="text-text-muted">{field}: </span>
                              <span className="text-red-500 line-through">{formatValue(field, before)}</span>
                              <span className="mx-1 text-text-muted">&rarr;</span>
                              <span className="text-emerald-600">{formatValue(field, after)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          本頁 {logs.length} 筆
        </span>
        <div className="flex gap-2">
          {nextCursor && (
            <PaginationLink
              href={`/admin/audit?cursor=${encodeURIComponent(nextCursor)}${params.action ? `&action=${encodeURIComponent(params.action)}` : ""}${params.entityType ? `&entityType=${encodeURIComponent(params.entityType)}` : ""}${params.actorType ? `&actorType=${encodeURIComponent(params.actorType)}` : ""}`}
              label="下一頁"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ───

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-ink text-white"
          : "bg-surface-hover text-text-secondary hover:bg-surface-muted hover:text-text-primary"
      }`}
    >
      {label}
    </a>
  );
}

function PaginationLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      {label}
    </a>
  );
}

function formatValue(field: string, val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (/email/i.test(field) && typeof val === "string" && val.includes("@")) {
    const [local, domain] = val.split("@");
    return local && domain ? `${local.slice(0, 2)}***@${domain}` : "[redacted]";
  }
  if (/(token|secret|api.?key|password|authorization|cookie|phone|customer|discordid)/i.test(field)) {
    return "[redacted]";
  }
  if (/(content|description|payload|raw|snapshot|body)/i.test(field)) {
    return "[summarized]";
  }
  if (typeof val === "string") return val.length > 40 ? val.slice(0, 40) + "..." : val;
  if (typeof val === "object") return "[object]";
  return String(val);
}
