"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";

interface CatalogRow {
  id: string;
  name: string;
  status: "success" | "warning";
}

const rows: CatalogRow[] = [
  { id: "course-01", name: "Agent 工作流實戰", status: "success" },
  { id: "course-02", name: "需求拆解與驗收", status: "warning" },
];

const columns: Column<CatalogRow>[] = [
  { key: "name", header: "內容", cell: (row) => row.name, searchValue: (row) => row.name },
  {
    key: "status",
    header: "狀態",
    cell: (row) => (
      <StatusBadge status={row.status}>{row.status === "success" ? "已發佈" : "草稿"}</StatusBadge>
    ),
  },
];

function CatalogTable(props: { data?: CatalogRow[]; loading?: boolean; errorMessage?: string }) {
  return (
    <DataTable
      data={props.data ?? rows}
      columns={columns}
      getRowKey={(row) => row.id}
      pageSize={5}
      searchPlaceholder="搜尋內容"
      emptyMessage="尚無內容；建立第一筆內容後會顯示在這裡。"
      loading={props.loading}
      errorMessage={props.errorMessage}
      mobileCard={(row) => (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface p-4">
          <span className="min-w-0 truncate text-sm font-medium text-text-primary">{row.name}</span>
          <StatusBadge status={row.status}>{row.status === "success" ? "已發佈" : "草稿"}</StatusBadge>
        </div>
      )}
    />
  );
}

export function DataTableCatalog() {
  return (
    <div className="space-y-8">
      <CatalogState title="Ready / Mobile" description="桌面使用表格，窄螢幕自動切換成可掃讀卡片。">
        <CatalogTable />
      </CatalogState>
      <CatalogState title="Loading" description="保留列與卡片尺寸，避免載入完成時跳動。">
        <CatalogTable loading />
      </CatalogState>
      <CatalogState title="Empty" description="說明目前沒有資料以及下一步。">
        <CatalogTable data={[]} />
      </CatalogState>
      <CatalogState title="Error" description="資料取得失敗時不偽裝成空資料。">
        <CatalogTable errorMessage="內容載入失敗，請重新整理後再試。" />
      </CatalogState>
    </div>
  );
}

function CatalogState({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`table-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="space-y-3 border-t border-border-subtle pt-5 first:border-0 first:pt-0">
      <div>
        <h3 id={`table-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}
