"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretDown, CaretUp, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

// ─── Types ───

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Text extractor for search — if provided, this column is searchable */
  searchValue?: (row: T) => string;
  /** Sort value extractor. Omit when the column must not be sortable. */
  sortValue?: (row: T) => string | number;
  /** Additional className for the <td> */
  className?: string;
  /** Additional className for the <th> */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Unique key extractor for each row */
  getRowKey: (row: T) => string;
  /** Rows per page (default 10) */
  pageSize?: number;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Message when no data */
  emptyMessage?: string;
  /** Optional mobile card renderer — shown on < md, table hidden */
  mobileCard?: (row: T) => React.ReactNode;
  /** Optional header actions (rendered next to search) */
  headerActions?: React.ReactNode;
  /** Displays layout-matched placeholders while data is loading. */
  loading?: boolean;
  /** Displays a table-level fetch error instead of rows. */
  errorMessage?: string;
  /** Cab-owned query observer. Feature code must not depend on TanStack query types. */
  onQueryChange?: (query: DataTableQueryState) => void;
}

export interface DataTableQueryState {
  search: string;
  sort: { key: string; direction: "asc" | "desc" } | null;
  pageIndex: number;
  pageSize: number;
}

export function DataTable<T>({
  data,
  columns,
  getRowKey,
  pageSize = 10,
  searchPlaceholder = "搜尋...",
  emptyMessage = "無資料",
  mobileCard,
  headerActions,
  loading = false,
  errorMessage,
  onQueryChange,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const hasSearch = columns.some((col) => col.searchValue);

  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<T>();
    return columns.map((column) =>
      helper.accessor(
        (row: T) => column.sortValue?.(row) ?? column.searchValue?.(row) ?? column.key,
        {
          id: column.key,
          header: column.header,
          cell: ({ row }) => column.cell(row.original),
          enableSorting: Boolean(column.sortValue),
          meta: column,
        },
      ),
    );
  }, [columns]);

  // TanStack Table exposes mutable table methods; React Compiler must not memoize this hook result.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch,
    onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, value) => {
      const query = String(value).trim().toLowerCase();
      if (!query) return true;
      return columns.some((column) =>
        column.searchValue?.(row.original).toLowerCase().includes(query),
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const totalPages = Math.max(1, table.getPageCount());
  const safePage = table.getState().pagination.pageIndex;
  const activePageSize = table.getState().pagination.pageSize;
  const filteredCount = table.getFilteredRowModel().rows.length;

  useEffect(() => {
    if (!onQueryChange) return;
    const activeSort = sorting[0];
    onQueryChange({
      search,
      sort: activeSort ? { key: activeSort.id, direction: activeSort.desc ? "desc" : "asc" } : null,
      pageIndex: safePage,
      pageSize: activePageSize,
    });
  }, [activePageSize, onQueryChange, safePage, search, sorting]);

  const showEmpty = !loading && !errorMessage && rows.length === 0;

  return (
    <div className="space-y-4" aria-busy={loading || undefined}>
      {/* Top bar: search + actions */}
      {(hasSearch || headerActions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {hasSearch && (
            <div className="relative flex-1 sm:max-w-xs">
              <Input
                type="text"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  table.setPageIndex(0);
                }}
                className="pl-9"
              />
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
            </div>
          )}
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}

      {/* Desktop table */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border-subtle bg-surface",
          mobileCard && "hidden md:block",
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const col = header.column.columnDef.meta as Column<T>;
                  const sorted = header.column.getIsSorted();
                  return (
                  <th
                    key={header.id}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn(
                      "px-6 py-3.5 text-xs font-medium uppercase text-text-muted",
                      col.headerClassName,
                    )}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-left transition-[background-color,color,transform] hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
                      >
                        {col.header}
                        {sorted === "asc" ? <CaretUp size={12} /> : <CaretDown size={12} className={sorted ? undefined : "opacity-40"} />}
                      </button>
                    ) : col.header}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                Array.from({ length: Math.min(pageSize, 5) }, (_, rowIndex) => (
                  <tr key={`loading-${rowIndex}`} aria-hidden="true">
                    {columns.map((column) => (
                      <td key={column.key} className="px-6 py-4">
                        <div className="h-4 w-full max-w-36 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : errorMessage ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-danger">
                    <span className="inline-flex items-center gap-2">
                      <WarningCircle size={18} weight="fill" aria-hidden="true" />
                      {errorMessage}
                    </span>
                  </td>
                </tr>
              ) : showEmpty ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-6 py-12 text-center text-sm text-text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((tableRow) => {
                  const row = tableRow.original;
                  return (
                  <tr
                    key={getRowKey(row)}
                    className="transition-colors hover:bg-surface-muted"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-6 py-4", col.className)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card mode */}
      {mobileCard && (
        <div className="space-y-3 md:hidden">
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div key={`mobile-loading-${index}`} aria-hidden="true" className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
              </div>
            ))
          ) : errorMessage ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-danger/25 bg-danger-light px-6 py-10 text-sm text-danger">
              <WarningCircle size={18} weight="fill" aria-hidden="true" />
              {errorMessage}
            </div>
          ) : showEmpty ? (
            <div className="rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center text-sm text-text-muted">
              {emptyMessage}
            </div>
          ) : (
            rows.map(({ original: row }) => (
              <div key={getRowKey(row)}>{mobileCard(row)}</div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && !errorMessage && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">
            共 {filteredCount} 筆，第 {safePage + 1}/{totalPages} 頁
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={safePage === 0}
              aria-label="第一頁"
            >
              &laquo;
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={safePage === 0}
            >
              上一頁
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={safePage >= totalPages - 1}
            >
              下一頁
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.setPageIndex(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              aria-label="最後一頁"
            >
              &raquo;
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
