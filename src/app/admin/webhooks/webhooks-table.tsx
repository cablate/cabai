"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ResendButton } from "./resend-button";

export interface WebhookRow {
  id: string;
  kind: "webhook" | "entitlement";
  eventType: string;
  status: string;
  httpStatus: number | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  serviceName: string | null;
}

const defaultWebhookStatus = { label: "等待中", variant: "warning" } as const;
const statusConfig: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  pending: defaultWebhookStatus,
  processing: { label: "處理中", variant: "warning" },
  sent: { label: "已送達", variant: "success" },
  delivered: { label: "已完成", variant: "success" },
  failed: { label: "失敗", variant: "danger" },
  dead_letter: { label: "Dead Letter", variant: "danger" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const columns: Column<WebhookRow>[] = [
  {
    key: "createdAt",
    header: "時間",
    cell: (r) => <span className="text-xs text-text-muted">{formatDate(r.createdAt)}</span>,
  },
  {
    key: "serviceName",
    header: "服務",
    cell: (r) => <span className="font-medium text-text-secondary">{r.serviceName ?? "-"}</span>,
    searchValue: (r) => r.serviceName ?? "",
  },
  {
    key: "eventType",
    header: "事件",
    cell: (r) => <span className="font-mono text-xs text-text-secondary">{r.eventType}</span>,
    searchValue: (r) => r.eventType,
  },
  {
    key: "status",
    header: "狀態",
    cell: (r) => {
      const s = statusConfig[r.status] ?? defaultWebhookStatus;
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
  },
  {
    key: "httpStatus",
    header: "HTTP",
    cell: (r) => <span className="font-mono text-xs text-text-muted">{r.httpStatus ?? "-"}</span>,
  },
  {
    key: "attempts",
    header: "重試",
    cell: (r) => <span className="font-mono text-xs text-text-muted">{r.attempts}/5</span>,
  },
  {
    key: "lastError",
    header: "錯誤",
    cell: (r) => (
      <span
        className="block max-w-[200px] truncate text-xs text-danger"
        title={r.lastError ?? undefined}
      >
        {r.lastError ?? "-"}
      </span>
    ),
    searchValue: (r) => r.lastError ?? "",
  },
  {
    key: "actions",
    header: "操作",
    cell: (r) =>
      r.status === "dead_letter" ? <ResendButton logId={r.id} kind={r.kind} /> : null,
  },
];

export function WebhooksTable({ data }: { data: WebhookRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowKey={(r) => r.id}
      pageSize={15}
      searchPlaceholder="搜尋服務、事件、錯誤..."
      emptyMessage="尚無 webhook 紀錄。請先在「外部服務管理」註冊服務並設定 webhook URL，付款事件將自動記錄於此。"
      mobileCard={(r) => {
        const s = statusConfig[r.status] ?? defaultWebhookStatus;
        return (
          <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-secondary">{r.serviceName ?? "-"}</span>
              <Badge variant={s.variant}>{s.label}</Badge>
            </div>
            <div className="font-mono text-xs text-text-muted">{r.eventType}</div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{formatDate(r.createdAt)}</span>
              <span>HTTP {r.httpStatus ?? "-"} | {r.attempts}/5</span>
            </div>
            {r.lastError && (
              <div className="text-xs text-danger truncate">{r.lastError}</div>
            )}
            {r.status === "dead_letter" && (
              <div className="pt-1">
                <ResendButton logId={r.id} kind={r.kind} />
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
