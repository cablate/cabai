import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SyncPlansCard } from "./sync-plans-card";
import { ReconcileCard } from "./reconcile-card";
import { CleanupOrdersCard } from "./cleanup-orders-card";
import { RebuildOrdersCard } from "./rebuild-orders-card";
import { getLatestJobRuns, isJobRunOverdue } from "@/lib/jobs/ledger";
import { combineCountSignals, getSystemHealthSnapshot } from "@/lib/system-health";

export default async function SystemPage() {
  const health = await getSystemHealthSnapshot();
  const latestJobRuns = await getLatestJobRuns();
  const pendingDeliveries = combineCountSignals([
    health.signals.pendingWebhookLogs,
    health.signals.pendingEntitlementTransitions,
  ]);
  const failedDeliveries = combineCountSignals([
    health.signals.failedWebhookLogs,
    health.signals.failedEntitlementTransitions,
  ]);
  const oldPendingOrders = health.signals.oldPendingOrders;

  return (
    <div className="space-y-8">
      <PageHeader title="系統維運" description="查看系統狀態和執行維運操作" />

      {health.status !== "ok" && (
        <div role="status" className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-700">
          部分系統訊號目前無法觀測；未知數值不會以 0 顯示。觀測時間：{health.observedAt.toLocaleString("zh-TW")}
        </div>
      )}

      {/* Health Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs text-text-muted mb-3">數據庫</p>
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                health.signals.database.status === "ok"
                  ? "bg-emerald-500"
                  : "bg-orange-500"
              }`}
            />
            <span className="text-sm font-medium">
              {health.signals.database.status === "ok" ? "正常" : "無法觀測"}
            </span>
          </div>
          {health.signals.database.errorClass && (
            <p className="text-xs text-danger mt-2">{health.signals.database.errorClass}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs text-text-muted mb-3">交付隊列（待處理）</p>
          <p className="text-2xl font-semibold text-text-primary">
            {pendingDeliveries.value ?? "未知"}
          </p>
          <p className="text-xs text-text-muted mt-1">待發送</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs text-text-muted mb-3">失敗交付</p>
          <p
            className={`text-2xl font-semibold ${
              failedDeliveries.value != null && failedDeliveries.value > 0
                ? "text-red-500"
                : "text-text-primary"
            }`}
          >
            {failedDeliveries.value ?? "未知"}
          </p>
          <p className="text-xs text-text-muted mt-1">Dead Letter</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs text-text-muted mb-3">待處理訂單</p>
          <p
            className={`text-2xl font-semibold ${
              oldPendingOrders.value != null && oldPendingOrders.value > 0
                ? "text-orange-500"
                : "text-text-primary"
            }`}
          >
            {oldPendingOrders.value ?? "未知"}
          </p>
          <p className="text-xs text-text-muted mt-1">&gt;24 小時</p>
        </Card>
      </div>

      {/* Last Activity */}
      <Card className="p-5">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-text-muted mb-1">最後 Webhook 活動</p>
            <p className="text-sm font-medium">
              {health.signals.lastWebhookTime.status === "unknown"
                ? "無法取得"
                : health.signals.lastWebhookTime.value
                  ? health.signals.lastWebhookTime.value.toLocaleString("zh-TW")
                  : "尚無記錄"}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-text-primary">背景工作最近狀態</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr><th className="py-2 pr-4">工作</th><th className="py-2 pr-4">狀態</th><th className="py-2">開始時間</th></tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {latestJobRuns.map(({ jobId, run }) => (
                <tr key={jobId}>
                  <td className="py-2 pr-4 font-mono text-xs">{jobId}</td>
                  <td className="py-2 pr-4">
                    {run ? `${run.status}${isJobRunOverdue(run) ? "（逾時）" : ""}` : "尚未執行"}
                  </td>
                  <td className="py-2 text-text-muted">{run?.startedAt.toLocaleString("zh-TW") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Maintenance Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">維運操作</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SyncPlansCard />
          <ReconcileCard />
          <CleanupOrdersCard />
          <RebuildOrdersCard />
        </div>
      </div>

      {/* Environment Info */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4 text-text-primary">環境資訊</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Node Environment</p>
            <code className="inline-block bg-surface-muted rounded px-2 py-1 text-xs font-mono">
              {health.environment.nodeEnv}
            </code>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">數據庫狀態</p>
            <code className="inline-block bg-surface-muted rounded px-2 py-1 text-xs font-mono">
              {health.environment.databaseConfigured ? "Configured" : "Not configured"}
            </code>
          </div>
        </div>
      </Card>
    </div>
  );
}
