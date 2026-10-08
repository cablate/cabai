import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAllLocalPlans, type LocalPlan } from "@/lib/plans-local";
import { ArrowRight, Receipt } from "@phosphor-icons/react/dist/ssr";
import { OrderRow, OrderCard } from "./order-row";

const defaultStatus = {
  label: "處理中",
  className:
    "bg-warning-light text-warning ring-1 ring-inset ring-warning/20",
} as const;

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  completed: {
    label: "已完成",
    className:
      "bg-success-light text-success ring-1 ring-inset ring-success/20",
  },
  pending: {
    label: "處理中",
    className:
      "bg-warning-light text-warning ring-1 ring-inset ring-warning/20",
  },
  failed: {
    label: "失敗",
    className: "bg-danger-light text-danger ring-1 ring-inset ring-danger/20",
  },
  canceled: {
    label: "已取消",
    className: "bg-surface-muted text-text-muted ring-1 ring-inset ring-border",
  },
  refunded: {
    label: "已退款",
    className:
      "bg-info-light text-info ring-1 ring-inset ring-info/20",
  },
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  // Fetch plan names from local DB
  const allPlans = await getAllLocalPlans();
  const planMap = new Map<string, LocalPlan>();
  allPlans.forEach((p) => planMap.set(p.id, p));

  return (
    <>

      <div className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-text-muted">
            訂單紀錄
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
            付款與訂閱紀錄
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            檢查歷史付款、訂單狀態與訂閱續費資訊。點擊任一列可展開更多細節。
          </p>
        </div>
        {userOrders.length > 0 && (
          <div className="grid w-full grid-cols-3 rounded-2xl border border-border-subtle bg-surface p-1 shadow-card sm:w-auto">
            <OrderMetric label="全部" value={userOrders.length} />
            <OrderMetric
              label="完成"
              value={userOrders.filter((order) => order.status === "completed").length}
            />
            <OrderMetric
              label="訂閱"
              value={userOrders.filter((order) => order.subscriptionId).length}
            />
          </div>
        )}
      </div>

      {/* Table / Empty state */}
        {userOrders.length === 0 ? (
          <div className="flex flex-col items-start justify-center rounded-3xl border border-border-subtle bg-surface p-8 shadow-card sm:p-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted">
              <Receipt size={26} weight="duotone" className="text-text-muted" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">
              尚無訂單紀錄
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
              完成購買後，付款金額、狀態與訂閱資訊會顯示在這裡。
            </p>
            <Link prefetch={false}
              href="/products"
              className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-6 py-3 text-sm font-medium text-text-inverted transition-all hover:opacity-90 active:scale-[0.98]"
            >
              探索內容與活動
              <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-muted/50">
                    <th className="px-6 py-4 text-left text-[10px] uppercase font-semibold text-text-muted">
                      日期
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] uppercase font-semibold text-text-muted">
                      商品
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] uppercase font-semibold text-text-muted">
                      訂單編號
                    </th>
                    <th className="px-6 py-4 text-right text-[10px] uppercase font-semibold text-text-muted">
                      金額
                    </th>
                    <th className="px-6 py-4 text-center text-[10px] uppercase font-semibold text-text-muted">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {userOrders.map((order) => {
                    const status =
                      statusConfig[order.status] ?? defaultStatus;
                    const plan = planMap.get(order.planId);
                    return (
                      <OrderRow
                        key={order.id}
                        order={{
                          id: order.id,
                          merchantOrderNumber: order.merchantOrderNumber,
                          planName: plan?.name ?? order.planId,
                          paymentMethod: order.paymentMethod,
                          paidAmount: order.paidAmount,
                          status: order.status,
                          statusLabel: status.label,
                          statusClassName: status.className,
                          createdAt: order.createdAt.toLocaleDateString("zh-TW", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          }),
                          subscriptionId: order.subscriptionId,
                          subscriptionStatus: order.subscriptionStatus,
                          nextBillingAt: order.nextBillingAt?.toLocaleDateString("zh-TW") ?? null,
                          cancelAtPeriodEnd: order.cancelAtPeriodEnd,
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="divide-y divide-border-subtle md:hidden">
              {userOrders.map((order) => {
                const status =
                  statusConfig[order.status] ?? defaultStatus;
                const plan = planMap.get(order.planId);
                return (
                  <OrderCard
                    key={order.id}
                    order={{
                      id: order.id,
                      merchantOrderNumber: order.merchantOrderNumber,
                      planName: plan?.name ?? order.planId,
                      paymentMethod: order.paymentMethod,
                      paidAmount: order.paidAmount,
                      status: order.status,
                      statusLabel: status.label,
                      statusClassName: status.className,
                      createdAt: order.createdAt.toLocaleDateString("zh-TW", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }),
                      subscriptionId: order.subscriptionId,
                      subscriptionStatus: order.subscriptionStatus,
                      nextBillingAt: order.nextBillingAt?.toLocaleDateString("zh-TW") ?? null,
                      cancelAtPeriodEnd: order.cancelAtPeriodEnd,
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
    </>
  );
}

function OrderMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-xl px-4 py-3 text-center">
      <p className="font-mono text-xl font-semibold text-text-primary tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}
