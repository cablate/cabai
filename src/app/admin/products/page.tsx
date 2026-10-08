import { getAllLocalPlans } from "@/lib/plans-local";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDeliveryOverviewForPlans } from "@/lib/delivery";

const defaultPlanStatus = { label: "未上架", variant: "default" } as const;
const statusConfig: Record<
  string,
  { label: string; variant: "success" | "default" }
> = {
  active: { label: "上架中", variant: "success" },
  inactive: defaultPlanStatus,
};

const billingLabels: Record<string, string> = {
  "one-time": "一次性",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

export default async function ProductsPage() {
  const allPlans = await getAllLocalPlans();
  const deliveryByPlanId = await getDeliveryOverviewForPlans(allPlans.map((plan) => plan.id), undefined, { includeUnpublished: true });

  return (
    <div className="space-y-8">
      <PageHeader
        title="商品管理"
        description="以下方案來自本地快取，管理方案請至 Portaly 後台。"
        actions={
          <a
            href="https://portaly.ai/admin/creator-subscription"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button>在 Portaly 新增方案</Button>
          </a>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  方案名稱
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  類型
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  價格
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  狀態
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  交付
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  Plan ID
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {allPlans.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-sm text-text-muted"
                  >
                    尚無方案，請先在 Portaly 後台建立
                  </td>
                </tr>
              )}
              {allPlans.map((plan) => {
                const status = statusConfig[plan.status] ?? defaultPlanStatus;
                const delivery = deliveryByPlanId.get(plan.id);
                return (
                  <tr
                    key={plan.id}
                    className="transition-colors hover:bg-surface-muted"
                  >
                    <td className="px-6 py-4 font-medium text-text-primary">
                      {plan.name}
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {billingLabels[plan.billingPeriod] ?? plan.billingPeriod}
                    </td>
                    <td className="px-6 py-4 font-mono text-text-secondary">
                      {formatPrice(plan.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      {delivery?.hasDelivery ? (
                        <div className="flex flex-wrap gap-1.5">
                          {delivery.courseCount > 0 && (
                            <Badge variant="success" className="text-[11px]">
                              課程 {delivery.courseCount}
                            </Badge>
                          )}
                          {delivery.contentCount > 0 && (
                            <Badge variant="info" className="text-[11px]">
                              內容 {delivery.contentCount}
                            </Badge>
                          )}
                          {delivery.activeServiceCount > 0 && (
                            <Badge variant="warning" className="text-[11px]">
                              服務 {delivery.activeServiceCount}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="warning">待設定</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-text-muted">
                      {plan.id}
                    </td>
                    <td className="px-6 py-4">
                      <Link prefetch={false}
                        href={`/admin/products/${plan.id}/delivery`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-success"
                      >
                        交付設定
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
    </div>
  );
}
