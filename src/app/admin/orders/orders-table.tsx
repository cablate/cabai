"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { OrderDetailSheet } from "./order-detail-sheet";

export interface OrderRow {
  id: string;
  merchantOrderNumber: string;
  status: string;
  paidAmount: number | null;
  expectedAmount: number | null;
  currency: string;
  expectedCurrency: string | null;
  paymentMethod: string | null;
  providerPlanId: string | null;
  providerMode: "test" | "live" | null;
  portalySessionId: string | null;
  checkoutSessionExpiresAt: string | null;
  updatedAt: string;
  refundAmount: number | null;
  refundedAt: string | null;
  refundReason: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  hasActiveEntitlement: boolean;
  createdAt: string;
  planId: string;
  planName: string;
  userEmail: string | null;
}

const defaultOrderStatus = { label: "處理中", variant: "warning" } as const;
const statusConfig: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  pending: defaultOrderStatus,
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失敗", variant: "danger" },
  canceled: { label: "已取消", variant: "default" },
  refunded: { label: "已退款", variant: "default" },
  expired: { label: "已過期", variant: "default" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const columns: Column<OrderRow>[] = [
  {
    key: "createdAt",
    header: "日期",
    cell: (r) => (
      <span className="whitespace-nowrap text-text-muted">{formatDate(r.createdAt)}</span>
    ),
    className: "whitespace-nowrap",
    sortValue: (r) => new Date(r.createdAt).getTime(),
  },
  {
    key: "merchantOrderNumber",
    header: "訂單編號",
    cell: (r) => (
      <span className="font-mono text-xs text-text-secondary">
        {r.merchantOrderNumber}
      </span>
    ),
    searchValue: (r) => r.merchantOrderNumber,
    sortValue: (r) => r.merchantOrderNumber,
  },
  {
    key: "userEmail",
    header: "客戶",
    cell: (r) => <span className="text-text-secondary">{r.userEmail ?? "-"}</span>,
    searchValue: (r) => r.userEmail ?? "",
    sortValue: (r) => r.userEmail ?? "",
  },
  {
    key: "planName",
    header: "商品",
    cell: (r) => <span className="text-text-secondary">{r.planName}</span>,
    searchValue: (r) => r.planName,
    sortValue: (r) => r.planName,
  },
  {
    key: "paidAmount",
    header: "金額",
    cell: (r) => (
      <span className="font-mono text-text-secondary">
        {r.paidAmount != null ? formatPrice(r.paidAmount) : "-"}
      </span>
    ),
    sortValue: (r) => r.paidAmount ?? -1,
  },
  {
    key: "status",
    header: "狀態",
    cell: (r) => {
      const s = statusConfig[r.status] ?? defaultOrderStatus;
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
  },
  {
    key: "actions",
    header: "管理",
    cell: (r) => <OrderDetailSheet order={r} />,
    className: "whitespace-nowrap text-right",
    headerClassName: "text-right",
  },
];

export function OrdersTable({ data }: { data: OrderRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowKey={(r) => r.id}
      pageSize={10}
      searchPlaceholder="搜尋訂單編號、客戶、商品..."
      emptyMessage="尚無訂單"
      mobileCard={(r) => {
        const s = statusConfig[r.status] ?? defaultOrderStatus;
        return (
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-text-muted">
                {r.merchantOrderNumber}
              </span>
              <Badge variant={s.variant}>{s.label}</Badge>
            </div>
            <div className="text-sm text-text-primary">{r.planName}</div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{r.userEmail ?? "-"}</span>
              <span className="font-mono">
                {r.paidAmount != null ? formatPrice(r.paidAmount) : "-"}
              </span>
            </div>
            <div className="text-xs text-text-muted">{formatDate(r.createdAt)}</div>
            <div className="flex justify-end border-t border-border-subtle pt-3">
              <OrderDetailSheet order={r} />
            </div>
          </div>
        );
      }}
    />
  );
}
