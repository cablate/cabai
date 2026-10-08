import Link from "next/link";
import { ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlansWithStatuses } from "@/lib/plan-list";
import { getPlanDisplayName } from "@/lib/plan-display";
import { SyncPlansButton } from "./sync-plans-button";
import { PlanStatusToggle } from "./plan-status-toggle";

const statusConfig: Record<
  string,
  { label: string; variant: "success" | "default" }
> = {
  active: { label: "上架中", variant: "success" },
  inactive: { label: "未上架", variant: "default" },
};

const billingLabels: Record<string, string> = {
  "one-time": "一次性",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

export default async function PlansPage() {
  const plansWithStatuses = await getPlansWithStatuses();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plans"
        description="Portaly 同步或本地建立，本站負責前台展示與交付"
        actions={
          <div className="flex items-center gap-3">
            <Link prefetch={false} href="/admin/plans/create">
              <Button>
                <Plus size={16} weight="bold" />
                新增方案
              </Button>
            </Link>
            <SyncPlansButton />
          </div>
        }
      />

      {plansWithStatuses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface py-16">
          <p className="text-sm text-text-muted mb-4">尚無方案，可在 Portaly 建立後同步，或直接在本地新增</p>
          <Link prefetch={false} href="/admin/plans/create">
            <Button>新增方案</Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  方案名稱
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  帳單類型
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  價格
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  前台展示
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  交付設定
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  金流
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  狀態
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {plansWithStatuses.map(({ plan, presentation, deliveryStatus }) => {
                const status = statusConfig[plan.status] ?? { label: "未上架", variant: "default" as const };

                // Presentation status badge
                const hasPresentationDraft = presentation !== null;
                const presentationPublished = presentation?.publishedAt !== null;

                // Delivery status badge
                const deliveryComplete = deliveryStatus.isFullySetup;
                const deliveryIncomplete = !deliveryStatus.canDeliver;

                return (
                  <tr
                    key={plan.id}
                    className="transition-colors hover:bg-surface-muted"
                  >
                    <td className="px-6 py-4 font-medium text-text-primary">
                      {getPlanDisplayName(plan.name, presentation?.title)}
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {billingLabels[plan.billingPeriod] ?? plan.billingPeriod}
                    </td>
                    <td className="px-6 py-4 font-mono text-text-secondary">
                      {formatPrice(plan.amount)}
                    </td>
                    <td className="px-6 py-4">
                      {hasPresentationDraft ? (
                        <Badge variant={presentationPublished ? "success" : "warning"}>
                          {presentationPublished ? "已發佈" : "草稿"}
                        </Badge>
                      ) : (
                        <Badge variant="default">未設定</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {deliveryComplete ? (
                        <Badge variant="success">完整</Badge>
                      ) : deliveryIncomplete ? (
                        <Badge variant="default">無交付</Badge>
                      ) : (
                        <Badge variant="warning">不完整</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={plan.gateway === "portaly" ? "default" : "warning"}>
                        {plan.gateway === "portaly" ? "Portaly" : "Manual"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <PlanStatusToggle planId={plan.id} currentStatus={plan.status} />
                        <span className={`text-xs ${plan.status === "active" ? "text-success" : "text-text-muted"}`}>
                          {status.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Link prefetch={false}
                        href={`/admin/plans/${plan.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-success"
                      >
                        詳情
                        <ArrowRight size={14} weight="bold" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
