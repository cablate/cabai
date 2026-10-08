"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export interface MemberRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
  purchaseCount: number;
}

const defaultRole = { label: "會員", variant: "default" } as const;
const roleConfig: Record<string, { label: string; variant: "default" | "info" }> = {
  admin: { label: "管理員", variant: "info" },
  member: defaultRole,
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

const columns: Column<MemberRow>[] = [
  {
    key: "name",
    header: "名稱",
    cell: (r) => (
      <span className="font-medium text-text-primary">{r.name ?? "-"}</span>
    ),
    searchValue: (r) => r.name ?? "",
  },
  {
    key: "email",
    header: "Email",
    cell: (r) => <span className="text-text-secondary">{r.email ?? "-"}</span>,
    searchValue: (r) => r.email ?? "",
  },
  {
    key: "role",
    header: "角色",
    cell: (r) => {
      const role = roleConfig[r.role] ?? defaultRole;
      return <Badge variant={role.variant}>{role.label}</Badge>;
    },
  },
  {
    key: "createdAt",
    header: "註冊日期",
    cell: (r) => <span className="text-text-muted">{formatDate(r.createdAt)}</span>,
  },
  {
    key: "purchaseCount",
    header: "購買數",
    cell: (r) => <span className="font-mono text-text-secondary">{r.purchaseCount}</span>,
  },
  {
    key: "actions",
    header: "操作",
    cell: (r) => (
      <Link prefetch={false}
        href={`/admin/members/${r.id}`}
        className="text-sm font-medium text-accent transition-colors hover:text-success"
      >
        詳情
      </Link>
    ),
  },
];

export function MembersTable({ data }: { data: MemberRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowKey={(r) => r.id}
      pageSize={10}
      searchPlaceholder="搜尋名稱、Email..."
      emptyMessage="尚無會員"
      mobileCard={(r) => {
        const role = roleConfig[r.role] ?? defaultRole;
        return (
          <Link prefetch={false}
            href={`/admin/members/${r.id}`}
            className="block rounded-2xl border border-border-subtle bg-surface p-4 space-y-2 transition-colors hover:bg-surface-muted"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">{r.name ?? "-"}</span>
              <Badge variant={role.variant}>{role.label}</Badge>
            </div>
            <div className="text-sm text-text-secondary">{r.email ?? "-"}</div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{formatDate(r.createdAt)}</span>
              <span>購買 {r.purchaseCount} 個方案</span>
            </div>
          </Link>
        );
      }}
    />
  );
}
