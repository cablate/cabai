"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  applyPurchaseImportAction,
  createMappingAction,
  deleteMappingAction,
  previewPurchaseImportAction,
  retryFailedEventsAction,
  updateMappingAction,
  type PortalyPurchaseImportPreviewActionResult,
} from "./actions";
import type { PortalyPurchaseImportPreview } from "@/lib/portaly-purchase-import";

interface MappingRow {
  id: string;
  portalyProductId: string;
  planId: string;
  planName: string;
  productName: string | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  portalyOrderId: string;
  portalyProductId: string;
  event: string;
  customerEmail: string;
  customerName: string | null;
  amount: number;
  currency: string;
  status: string;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

interface PlanOption {
  id: string;
  name: string;
  status?: string;
}

interface PendingProductGroup {
  portalyProductId: string;
  count: number;
}

interface ProductOption {
  portalyProductId: string;
  eventCount: number;
  latestEmail: string;
  isMapped: boolean;
}

export function MarketplaceManager({
  mappings,
  events,
  plans,
  importPlans,
  pendingGroups,
  productOptions,
}: {
  mappings: MappingRow[];
  events: EventRow[];
  plans: PlanOption[];
  importPlans: PlanOption[];
  pendingGroups: PendingProductGroup[];
  productOptions: ProductOption[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [portalyProductId, setPortalyProductId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [productName, setProductName] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [useCustomId, setUseCustomId] = useState(false);

  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState("");
  const [editingProductName, setEditingProductName] = useState("");
  const [editingLoading, setEditingLoading] = useState(false);

  const [importPlanId, setImportPlanId] = useState(importPlans[0]?.id ?? "");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState<PortalyPurchaseImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const canApplyPreview = useMemo(
    () => !!preview && preview.conflictRows === 0 && preview.invalidRows === 0,
    [preview],
  );

  async function handleCreateMapping() {
    if (!portalyProductId.trim() || !selectedPlanId) return;
    setMappingLoading(true);
    try {
      const result = await createMappingAction(portalyProductId, selectedPlanId, productName);
      if (result.success) {
        const processed = result.batchResult?.processed ?? 0;
        toast.success(
          processed > 0
            ? `Mapping 已建立，並處理 ${processed} 筆 pending event。`
            : "Mapping 已建立。",
        );
        setPortalyProductId("");
        setSelectedPlanId("");
        setProductName("");
        setShowCreate(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "建立 mapping 失敗。");
      }
    } catch {
      toast.error("建立 mapping 失敗。");
    } finally {
      setMappingLoading(false);
    }
  }

  async function handleDelete(mappingId: string) {
    if (!confirm("確定要刪除這個 mapping？已處理的訂單不會被移除。")) return;
    const result = await deleteMappingAction(mappingId);
    if (result.success) {
      toast.success("Mapping 已刪除。");
      router.refresh();
    } else {
      toast.error(result.error ?? "刪除 mapping 失敗。");
    }
  }

  function startEditMapping(mapping: MappingRow) {
    setEditingMappingId(mapping.id);
    setEditingPlanId(mapping.planId);
    setEditingProductName(mapping.productName ?? "");
  }

  function cancelEditMapping() {
    setEditingMappingId(null);
    setEditingPlanId("");
    setEditingProductName("");
  }

  async function handleUpdateMapping() {
    if (!editingMappingId || !editingPlanId) return;
    setEditingLoading(true);
    try {
      const result = await updateMappingAction(editingMappingId, editingPlanId, editingProductName || null);
      if (result.success) {
        toast.success("Mapping 已更新。歷史訂單不會被追溯，之後的 event 才會用新對應。");
        cancelEditMapping();
        router.refresh();
      } else {
        toast.error(result.error ?? "更新 mapping 失敗。");
      }
    } catch {
      toast.error("更新 mapping 失敗。");
    } finally {
      setEditingLoading(false);
    }
  }

  async function handleRetry(productId: string) {
    const result = await retryFailedEventsAction(productId);
    if (result.success && result.batchResult) {
      toast.success(
        `重跑完成：成功 ${result.batchResult.processed}，失敗 ${result.batchResult.failed}。`,
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "重跑失敗。");
    }
  }

  async function handlePreviewImport() {
    if (!importPlanId || !importFile) {
      toast.error("請選擇 plan 和匯入檔案。");
      return;
    }

    setPreviewLoading(true);
    setPreview(null);
    try {
      const result = await runImportAction(previewPurchaseImportAction, importPlanId, importFile);
      if (result.success) {
        setPreview(result.preview);
        toast.success(`預覽完成：${result.preview.totalRows} 筆資料。`);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("匯入預覽失敗。");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApplyImport() {
    if (!importPlanId || !importFile || !preview) return;
    if (!canApplyPreview) {
      toast.error("仍有 conflict 或 invalid 列，請先修正後再匯入。");
      return;
    }

    setImportLoading(true);
    try {
      const result = await runImportAction(applyPurchaseImportAction, importPlanId, importFile);
      if (result.success) {
        toast.success(
          `匯入完成：處理 ${result.result.processedRows} 筆，略過 ${result.result.skippedRows} 筆。`,
        );
        if (result.result.failedRows > 0) {
          toast.error(`有 ${result.result.failedRows} 筆處理失敗，請查看 event 列表。`);
        }
        setPreview(null);
        setImportFile(null);
        setFileInputKey((key) => key + 1);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("匯入失敗。");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PurchaseImportPanel
        plans={importPlans}
        selectedPlanId={importPlanId}
        onPlanChange={(planId) => {
          setImportPlanId(planId);
          setPreview(null);
        }}
        fileInputKey={fileInputKey}
        onFileChange={(file) => {
          setImportFile(file);
          setPreview(null);
        }}
        preview={preview}
        previewLoading={previewLoading}
        importLoading={importLoading}
        canApply={canApplyPreview}
        onPreview={handlePreviewImport}
        onApply={handleApplyImport}
      />

      {pendingGroups.length > 0 && (
        <Card className="border-warning bg-warning/5 p-4">
          <h3 className="mb-2 font-semibold text-warning">有 event 等待商品 mapping</h3>
          <p className="mb-3 text-sm text-text-secondary">
            這些 Portaly 商品 ID 還沒有對應到本地 plan。建立 mapping 後，系統會自動補處理同商品的 pending event。
          </p>
          <div className="space-y-2">
            {pendingGroups.map((group) => (
              <div
                key={group.portalyProductId}
                className="flex items-center justify-between rounded-md bg-surface p-3"
              >
                <div>
                  <span className="font-mono text-sm">{group.portalyProductId}</span>
                  <span className="ml-2 text-sm text-text-secondary">{group.count} 筆待處理</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setPortalyProductId(group.portalyProductId);
                    setShowCreate(true);
                  }}
                >
                  建立 mapping
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">商品 mapping</h2>
          <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? "ghost" : "primary"}>
            {showCreate ? "取消" : "新增 mapping"}
          </Button>
        </div>

        {showCreate && (
          <Card className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Portaly 商品 ID</label>
              {!useCustomId && productOptions.length > 0 ? (
                <select
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                  value={portalyProductId}
                  onChange={(event) => setPortalyProductId(event.target.value)}
                >
                  <option value="">選擇商品 ID...</option>
                  {productOptions
                    .filter((product) => !product.isMapped)
                    .map((product) => (
                      <option key={product.portalyProductId} value={product.portalyProductId}>
                        {product.portalyProductId} ({product.eventCount} 筆，最近 {product.latestEmail})
                      </option>
                    ))}
                  {productOptions.some((product) => product.isMapped) && (
                    <optgroup label="已建立 mapping">
                      {productOptions
                        .filter((product) => product.isMapped)
                        .map((product) => (
                          <option key={product.portalyProductId} value={product.portalyProductId}>
                            {product.portalyProductId} ({product.eventCount} 筆)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                  placeholder="例如 Ne8UZxuuWWWlg1NP21p5"
                  value={portalyProductId}
                  onChange={(event) => setPortalyProductId(event.target.value)}
                />
              )}
              {productOptions.length > 0 && (
                <button
                  type="button"
                  className="mt-1 text-xs text-accent hover:text-success"
                  onClick={() => { setUseCustomId(!useCustomId); setPortalyProductId(""); }}
                >
                  {useCustomId ? "從列表選擇" : "自由輸入商品 ID"}
                </button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">對應 plan</label>
              <select
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
              >
                <option value="">選擇 plan...</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">商品名稱（選填）</label>
              <input
                type="text"
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                placeholder="方便辨識的商品名稱"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </div>
            <Button
              onClick={handleCreateMapping}
              loading={mappingLoading}
              disabled={!portalyProductId.trim() || !selectedPlanId}
            >
              建立 mapping
            </Button>
          </Card>
        )}

        {mappings.length === 0 ? (
          <Card className="p-8 text-center text-text-secondary">
            <p>尚未建立商品 mapping。收到 webhook 後，可以把 Portaly 商品 ID 對應到本地 plan。</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left">
                  <th className="pb-2 pr-4 font-medium">Portaly 商品 ID</th>
                  <th className="pb-2 pr-4 font-medium">商品名稱</th>
                  <th className="pb-2 pr-4 font-medium">對應 plan</th>
                  <th className="pb-2 pr-4 font-medium">建立時間</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => {
                  const isEditing = editingMappingId === mapping.id;
                  return (
                    <tr key={mapping.id} className="border-b border-border-subtle/50">
                      <td className="py-3 pr-4 font-mono text-xs">{mapping.portalyProductId}</td>
                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <input
                            type="text"
                            className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm"
                            value={editingProductName}
                            onChange={(event) => setEditingProductName(event.target.value)}
                            placeholder="商品名稱（選填）"
                          />
                        ) : (
                          mapping.productName || "-"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <select
                            className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm"
                            value={editingPlanId}
                            onChange={(event) => setEditingPlanId(event.target.value)}
                          >
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          mapping.planName
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {new Date(mapping.createdAt).toLocaleDateString("zh-TW")}
                      </td>
                      <td className="py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              loading={editingLoading}
                              onClick={handleUpdateMapping}
                            >
                              儲存
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditMapping}
                              disabled={editingLoading}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditMapping(mapping)}
                            >
                              編輯
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() => handleDelete(mapping.id)}
                            >
                              刪除
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">最近 marketplace events</h2>
        {events.length === 0 ? (
          <Card className="p-8 text-center text-text-secondary">
            <p>尚無 Portaly marketplace event。設定 webhook 後，新購買會出現在這裡。</p>
          </Card>
        ) : (
          <DataTable
            data={events}
            getRowKey={(event) => event.id}
            pageSize={15}
            searchPlaceholder="搜尋 email 或訂單 ID..."
            emptyMessage="沒有符合條件的 event"
            columns={eventColumns(handleRetry)}
          />
        )}
      </section>
    </div>
  );
}

function PurchaseImportPanel({
  plans,
  selectedPlanId,
  onPlanChange,
  fileInputKey,
  onFileChange,
  preview,
  previewLoading,
  importLoading,
  canApply,
  onPreview,
  onApply,
}: {
  plans: PlanOption[];
  selectedPlanId: string;
  onPlanChange: (planId: string) => void;
  fileInputKey: number;
  onFileChange: (file: File | null) => void;
  preview: PortalyPurchaseImportPreview | null;
  previewLoading: boolean;
  importLoading: boolean;
  canApply: boolean;
  onPreview: () => void;
  onApply: () => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">匯入 Portaly 購買紀錄</h2>
        <p className="mt-1 text-sm text-text-secondary">
          支援 Portaly 匯出的 CSV 或 XLSX。系統會先預覽每列狀態，只有 new / process_existing 會寫入。
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium">匯入目標 plan</label>
            <select
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
              value={selectedPlanId}
              onChange={(event) => onPlanChange(event.target.value)}
            >
              {plans.length === 0 ? (
                <option value="">沒有可選 plan</option>
              ) : (
                plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.status && plan.status !== "active" ? ` (${plan.status})` : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">檔案</label>
            <input
              key={fileInputKey}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
          </div>

          <Button onClick={onPreview} loading={previewLoading} disabled={plans.length === 0}>
            預覽
          </Button>
        </div>

        {preview && <ImportPreview preview={preview} canApply={canApply} loading={importLoading} onApply={onApply} />}
      </Card>
    </section>
  );
}

function ImportPreview({
  preview,
  canApply,
  loading,
  onApply,
}: {
  preview: PortalyPurchaseImportPreview;
  canApply: boolean;
  loading: boolean;
  onApply: () => void;
}) {
  const visibleRows = preview.rows.slice(0, 80);

  return (
    <div className="space-y-4 border-t border-border-subtle pt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <PreviewStat label="總列數" value={preview.totalRows} />
        <PreviewStat label="可新增" value={preview.newRows} />
        <PreviewStat label="補處理" value={preview.processExistingRows} />
        <PreviewStat label="重複略過" value={preview.duplicateRows} />
        <PreviewStat label="衝突" value={preview.conflictRows} tone={preview.conflictRows > 0 ? "danger" : undefined} />
        <PreviewStat label="無效" value={preview.invalidRows} tone={preview.invalidRows > 0 ? "danger" : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-text-secondary">
          目標 plan：<span className="font-medium text-text-primary">{preview.planName}</span>
          <span className="mx-2">/</span>
          付款總額：<span className="font-mono">{formatCurrency(preview.amountTotal)}</span>
        </div>
        <Button onClick={onApply} loading={loading} disabled={!canApply} variant={canApply ? "primary" : "secondary"}>
          確認匯入
        </Button>
      </div>

      {!canApply && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          目前有 conflict 或 invalid 列。匯入前請先修正檔案，或移除有問題的資料列。
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="whitespace-nowrap py-2 pr-4 font-medium">列</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">狀態</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">訂單編號</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">客戶</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">金額</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">原因</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.rowNumber}-${row.orderId}-${row.event}`} className="border-b border-border-subtle/50">
                <td className="py-2 pr-4 text-text-muted">{row.rowNumber}</td>
                <td className="py-2 pr-4">
                  <ImportStatusBadge status={row.status} action={row.action} />
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{row.orderId || "-"}</td>
                <td className="py-2 pr-4">
                  <div>{row.customerName || "-"}</div>
                  <div className="text-xs text-text-muted">{row.customerEmail || "-"}</div>
                </td>
                <td className="py-2 pr-4 font-mono">{row.amount == null ? "-" : formatCurrency(row.amount)}</td>
                <td className="min-w-64 py-2 pr-4 text-text-secondary">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.rows.length > visibleRows.length && (
        <p className="text-xs text-text-muted">
          只顯示前 {visibleRows.length} 筆預覽列；確認匯入時仍會處理全部 {preview.rows.length} 筆。
        </p>
      )}
    </div>
  );
}

function PreviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={tone === "danger" ? "font-mono text-lg font-semibold text-danger" : "font-mono text-lg font-semibold"}>
        {value}
      </div>
    </div>
  );
}

function ImportStatusBadge({
  status,
  action,
}: {
  status: string;
  action: string;
}) {
  if (status === "new" && action === "process_existing") {
    return <Badge variant="info">補處理</Badge>;
  }
  if (status === "new") return <Badge variant="success">新增</Badge>;
  if (status === "duplicate") return <Badge variant="default">重複</Badge>;
  if (status === "conflict") return <Badge variant="danger">衝突</Badge>;
  if (status === "invalid") return <Badge variant="warning">無效</Badge>;
  return <Badge>{status}</Badge>;
}

function eventColumns(onRetry: (productId: string) => void): Column<EventRow>[] {
  return [
    {
      key: "status",
      header: "狀態",
      cell: (event) => <EventStatusBadge status={event.status} />,
      searchValue: (event) => event.status,
    },
    {
      key: "event",
      header: "事件",
      cell: (event) => (
        <span className={event.event === "refund" ? "text-danger" : ""}>
          {event.event === "paid" ? "付款" : "退款"}
        </span>
      ),
    },
    {
      key: "customer",
      header: "客戶",
      cell: (event) => (
        <div>
          <div>{event.customerName || "-"}</div>
          <div className="text-xs text-text-muted">{event.customerEmail}</div>
        </div>
      ),
      searchValue: (event) => `${event.customerEmail} ${event.customerName ?? ""}`,
    },
    {
      key: "amount",
      header: "金額",
      cell: (event) => `${event.currency} ${event.amount.toLocaleString()}`,
    },
    {
      key: "productId",
      header: "商品 ID",
      cell: (event) => <span className="font-mono text-xs">{event.portalyProductId.slice(0, 18)}</span>,
      searchValue: (event) => event.portalyProductId,
    },
    {
      key: "orderId",
      header: "訂單",
      cell: (event) => <span className="font-mono text-xs">{event.portalyOrderId.slice(0, 12)}</span>,
      searchValue: (event) => event.portalyOrderId,
    },
    {
      key: "createdAt",
      header: "收到時間",
      cell: (event) => (
        <span className="whitespace-nowrap text-xs text-text-muted">
          {new Date(event.createdAt).toLocaleString("zh-TW")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      cell: (event) =>
        event.status === "pending_mapping" || event.status === "failed" ? (
          <Button variant="ghost" size="sm" onClick={() => onRetry(event.portalyProductId)}>
            重跑
          </Button>
        ) : (
          <span className="text-text-muted">-</span>
        ),
    },
  ];
}

function EventStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }> = {
    processed: { label: "已處理", variant: "success" },
    pending_mapping: { label: "等 mapping", variant: "warning" },
    pending: { label: "待處理", variant: "info" },
    refunded: { label: "已退款", variant: "danger" },
    failed: { label: "失敗", variant: "danger" },
  };
  const item = config[status] ?? { label: status, variant: "default" };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function runImportAction<T extends PortalyPurchaseImportPreviewActionResult | Awaited<ReturnType<typeof applyPurchaseImportAction>>>(
  action: (formData: FormData) => Promise<T>,
  planId: string,
  file: File,
): Promise<T> {
  const formData = new FormData();
  formData.set("planId", planId);
  formData.set("file", file);
  return action(formData);
}
