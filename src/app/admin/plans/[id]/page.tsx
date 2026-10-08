import Link from "next/link";
import { db } from "@/lib/db";
import { orders, userPurchases } from "@/lib/db/schema";
import { eq, and, count, sum } from "drizzle-orm";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X } from "@phosphor-icons/react/dist/ssr";
import { getPlanWithStatuses } from "@/lib/plan-list";
import { getPlanDisplayName } from "@/lib/plan-display";
import { EditPlanForm } from "./edit-plan-form";
import { PlanStatusToggle } from "../plan-status-toggle";
import { DeletePlanButton } from "../delete-plan-button";
import { PlanTabs } from "./_components/plan-tabs";

const billingLabels: Record<string, string> = {
  "one-time": "一次付費",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: planId } = await params;

  // Fetch plan with statuses
  let planWithStatuses;
  try {
    planWithStatuses = await getPlanWithStatuses(planId);
  } catch {
    return (
      <div className="space-y-4">
        <Link prefetch={false}
          href="/admin/plans"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
        >
          <ArrowLeft size={16} weight="bold" />
          返回 Plans
        </Link>
        <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
          <p className="text-text-muted">方案不存在</p>
        </div>
      </div>
    );
  }

  const { plan, presentation, deliveryStatus } = planWithStatuses;

  // Fetch total order count
  const totalOrdersResult = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.planId, planId));

  // Fetch completed orders count and revenue
  const completedOrdersResult = await db
    .select({
      count: count(),
      revenue: sum(orders.paidAmount),
    })
    .from(orders)
    .where(and(eq(orders.planId, planId), eq(orders.status, "completed")));

  // Count distinct members
  const memberCountResult = await db
    .selectDistinct({
      userId: userPurchases.userId,
    })
    .from(userPurchases)
    .where(eq(userPurchases.planId, planId));

  const totalOrders = totalOrdersResult[0]?.value ?? 0;
  const completedOrders = completedOrdersResult[0]?.count ?? 0;
  const totalRevenue = (completedOrdersResult[0]?.revenue as number | null) ?? 0;
  const memberCount = memberCountResult.length;

  const statusConfig: Record<string, { label: string; variant: "success" | "default" }> = {
    active: { label: "上架中", variant: "success" },
    inactive: { label: "未上架", variant: "default" },
  };
  const status = statusConfig[plan.status] ?? { label: "未上架", variant: "default" as const };

  // Presentation status
  const hasPresentationDraft = presentation !== null;
  const presentationPublished = presentation?.publishedAt !== null;
  const providerPlanId = plan.providerPlanId ?? plan.id;
  const usesSharedProviderPlan = providerPlanId !== plan.id;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link prefetch={false}
          href="/admin/plans"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
        >
          <ArrowLeft size={16} weight="bold" />
          返回 Plans
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-text-primary">
            {getPlanDisplayName(plan.name, presentation?.title)}
          </h1>
          <DeletePlanButton planId={plan.id} planName={getPlanDisplayName(plan.name, presentation?.title)} />
        </div>
      </div>

      {/* Tab navigation */}
      <PlanTabs planId={planId} activeTab="overview" />

      {/* Plan Summary Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">方案摘要</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">方案名稱</p>
            <p className="text-text-primary font-medium">{getPlanDisplayName(plan.name, presentation?.title)}</p>
            {presentation?.title && presentation.title !== plan.name && (
              <p className="text-xs text-text-muted mt-1">Portaly 原名：{plan.name}</p>
            )}
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">方案 ID</p>
            <p className="text-text-secondary font-mono text-sm">{plan.id}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">價格</p>
            <p className="text-text-primary font-medium">{formatPrice(plan.amount)}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">帳單週期</p>
            <p className="text-text-primary font-medium">
              {billingLabels[plan.billingPeriod] ?? plan.billingPeriod}
            </p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">金流管道</p>
            <Badge variant={plan.gateway === "portaly" ? "default" : "warning"}>
              {plan.gateway === "portaly" ? "Portaly Vibe" : "Manual"}
            </Badge>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">狀態</p>
            <div className="flex items-center gap-3">
              <PlanStatusToggle planId={plan.id} currentStatus={plan.status} />
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">最後同步</p>
            <p className="text-text-secondary text-sm">
              {new Date(plan.syncedAt).toLocaleString("zh-TW")}
            </p>
          </div>
        </div>
      </div>

      {/* Source Info Section (Portaly only) */}
      {plan.gateway === "portaly" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Portaly 同步資訊</h2>
          {usesSharedProviderPlan && (
            <div className="rounded-lg border border-warning-light bg-warning-light/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="warning">共用 Provider Plan</Badge>
                <p className="text-sm font-medium text-text-primary">
                  Portaly provider plan 只決定付款端行為，本地 plan 仍是商品、課程與權限的主體。
                </p>
              </div>
              <p className="mt-2 text-sm text-text-muted">
                Portaly 付款頁可能顯示 provider plan 名稱；後台訂單與內容交付會依本地訂單對回此 plan。
              </p>
            </div>
          )}
          <div className="rounded-lg border border-border-subtle bg-surface-muted p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase text-text-muted font-medium mb-1">Local Plan ID</p>
                <p className="text-text-secondary font-mono text-sm">{plan.id}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-text-muted font-medium mb-1">Provider Plan ID</p>
                <p className="text-text-secondary font-mono text-sm">{providerPlanId}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-text-muted font-medium mb-1">有平台內容</p>
                <p className="text-text-secondary text-sm">{plan.hasPlatformContent ? "是" : "否"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-text-muted font-medium mb-1">有外部服務</p>
                <p className="text-text-secondary text-sm">{plan.hasExternalService ? "是" : "否"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Section (all gateways) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">編輯方案</h2>
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <p className="text-sm text-text-muted mb-6">
            {plan.gateway === "portaly"
              ? "編輯後將同步到 Portaly Vibe，Portaly 上的方案資料會同步更新。"
              : "此方案為本地建立，可直接編輯。金流透過 Portaly 官方賣場 webhook 或管理員手動授權處理。"}
          </p>
          <EditPlanForm
            gateway={plan.gateway as "portaly" | "manual"}
            plan={{
              id: plan.id,
              slug: plan.slug,
              name: plan.name,
              description: plan.description,
              amount: plan.amount,
              billingPeriod: plan.billingPeriod,
              pricingType: plan.pricingType,
              status: plan.status,
              providerPlanId: plan.providerPlanId,
            }}
          />
        </div>
      </div>

      {/* Presentation Status Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">前台展示</h2>
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <Badge variant={presentationPublished ? "success" : hasPresentationDraft ? "warning" : "default"}>
                {presentationPublished ? "已發佈" : hasPresentationDraft ? "草稿" : "未設定"}
              </Badge>
            </div>
          </div>

          {hasPresentationDraft && presentation ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {presentation.offeringType && (
                  <div>
                    <p className="text-xs uppercase text-text-muted font-medium mb-1">供應類型</p>
                    <p className="text-text-secondary">{presentation.offeringType}</p>
                  </div>
                )}
                {presentation.title && (
                  <div>
                    <p className="text-xs uppercase text-text-muted font-medium mb-1">標題</p>
                    <p className="text-text-secondary">{presentation.title}</p>
                  </div>
                )}
                {presentation.subtitle && (
                  <div>
                    <p className="text-xs uppercase text-text-muted font-medium mb-1">副標題</p>
                    <p className="text-text-secondary">{presentation.subtitle}</p>
                  </div>
                )}
                {presentation.isFeatured && (
                  <div>
                    <p className="text-xs uppercase text-text-muted font-medium mb-1">精選展示</p>
                    <p className="text-text-secondary">Yes</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-sm">未設定前台展示，請點擊下方按鈕編輯</p>
          )}

          <div className="mt-6">
            <Link prefetch={false} href={`/admin/plans/${planId}/presentation`}>
              <Button>編輯前台展示</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Delivery Status Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">交付設定</h2>
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="flex items-start justify-between mb-4">
            <Badge
              variant={
                deliveryStatus.isFullySetup
                  ? "success"
                  : deliveryStatus.canDeliver
                    ? "warning"
                    : "default"
              }
            >
              {deliveryStatus.isFullySetup
                ? "完整"
                : deliveryStatus.canDeliver
                  ? "不完整"
                  : "無交付"}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {deliveryStatus.hasPresentation ? (
                <Check size={16} className="text-success" weight="bold" />
              ) : (
                <X size={16} className="text-danger" weight="bold" />
              )}
              <span className={deliveryStatus.hasPresentation ? "text-text-primary" : "text-text-muted"}>
                有前台展示
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {deliveryStatus.presentationPublished ? (
                <Check size={16} className="text-success" weight="bold" />
              ) : (
                <X size={16} className="text-danger" weight="bold" />
              )}
              <span className={deliveryStatus.presentationPublished ? "text-text-primary" : "text-text-muted"}>
                前台展示已發佈
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {deliveryStatus.hasCourses ? (
                <Check size={16} className="text-success" weight="bold" />
              ) : (
                <X size={16} className="text-danger" weight="bold" />
              )}
              <span className={deliveryStatus.hasCourses ? "text-text-primary" : "text-text-muted"}>
                有課程
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {deliveryStatus.hasPlanContents ? (
                <Check size={16} className="text-success" weight="bold" />
              ) : (
                <X size={16} className="text-danger" weight="bold" />
              )}
              <span className={deliveryStatus.hasPlanContents ? "text-text-primary" : "text-text-muted"}>
                有內容
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {deliveryStatus.hasServiceConfigs ? (
                <Check size={16} className="text-success" weight="bold" />
              ) : (
                <X size={16} className="text-danger" weight="bold" />
              )}
              <span className={deliveryStatus.hasServiceConfigs ? "text-text-primary" : "text-text-muted"}>
                有外部服務
              </span>
            </div>

          </div>

          <div className="mt-6">
            <Link prefetch={false} href={`/admin/plans/${planId}/delivery`}>
              <Button>設定交付</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Orders Summary */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">訂單統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-6">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">總訂單數</p>
            <p className="text-3xl font-semibold text-text-primary">{totalOrders}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-6">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">已完成訂單</p>
            <p className="text-3xl font-semibold text-text-primary">{completedOrders}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-6">
            <p className="text-xs uppercase text-text-muted font-medium mb-2">總營收</p>
            <p className="text-3xl font-semibold text-text-primary">{formatPrice(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Members Summary */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">會員統計</h2>
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase text-text-muted font-medium mb-2">持有此方案的會員</p>
              <p className="text-3xl font-semibold text-text-primary">{memberCount}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
