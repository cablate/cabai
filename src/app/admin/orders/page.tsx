import Link from "next/link";
import { db } from "@/lib/db";
import { orders, userPurchases, users } from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { listOrders } from "@/lib/portaly";
import { buildPlanDisplayNameMap } from "@/lib/plan-display";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { OrdersTable, type OrderRow } from "./orders-table";
import { parseOrdersView, type OrdersView } from "./orders-view";

function ViewNavigation({ view }: { view: OrdersView }) {
  const items: Array<{ value: OrdersView; label: string; description: string }> = [
    {
      value: "local",
      label: "站內訂單",
      description: "查詢 CabAI 建立與追蹤的訂單",
    },
    {
      value: "provider",
      label: "Portaly 對帳",
      description: "比對付款商紀錄與本地商品",
    },
  ];

  return (
    <nav
      aria-label="訂單資料來源"
      className="grid gap-2 rounded-2xl border border-border-subtle bg-surface p-2 sm:grid-cols-2"
    >
      {items.map((item) => {
        const active = item.value === view;
        return (
          <Link prefetch={false}
            key={item.value}
            href={`/admin/orders?view=${item.value}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-4 py-3 transition-[background-color,color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.99] ${
              active
                ? "bg-ink text-white shadow-sm"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className={`mt-1 block text-xs ${active ? "text-white/60" : "text-text-muted"}`}>
              {item.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = parseOrdersView((await searchParams).view);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="訂單與對帳"
        description="站內訂單負責交易狀態；Portaly 對帳用來比對付款商紀錄。"
      />
      <ViewNavigation view={view} />
      {view === "provider" ? <ProviderOrdersView /> : <LocalOrdersView />}
    </div>
  );
}

async function LocalOrdersView() {
  const [allOrders, activePurchases, planNameMap] = await Promise.all([
    db
      .select({
        id: orders.id,
        merchantOrderNumber: orders.merchantOrderNumber,
        status: orders.status,
        paidAmount: orders.paidAmount,
        expectedAmount: orders.expectedAmount,
        currency: orders.currency,
        expectedCurrency: orders.expectedCurrency,
        paymentMethod: orders.paymentMethod,
        providerPlanId: orders.providerPlanId,
        providerMode: orders.providerMode,
        portalySessionId: orders.portalySessionId,
        checkoutSessionExpiresAt: orders.checkoutSessionExpiresAt,
        updatedAt: orders.updatedAt,
        refundAmount: orders.refundAmount,
        refundedAt: orders.refundedAt,
        refundReason: orders.refundReason,
        subscriptionId: orders.subscriptionId,
        subscriptionStatus: orders.subscriptionStatus,
        createdAt: orders.createdAt,
        planId: orders.planId,
        userEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(orders.createdAt)),
    db
      .selectDistinct({ orderId: userPurchases.orderId })
      .from(userPurchases)
      .where(isNull(userPurchases.revokedAt)),
    buildPlanDisplayNameMap(),
  ]);

  const activeOrderIds = new Set(
    activePurchases.flatMap((purchase) => purchase.orderId ? [purchase.orderId] : []),
  );

  const tableData: OrderRow[] = allOrders.map((order) => ({
    id: order.id,
    merchantOrderNumber: order.merchantOrderNumber,
    status: order.status,
    paidAmount: order.paidAmount,
    expectedAmount: order.expectedAmount,
    currency: order.currency,
    expectedCurrency: order.expectedCurrency,
    paymentMethod: order.paymentMethod,
    providerPlanId: order.providerPlanId,
    providerMode: order.providerMode,
    portalySessionId: order.portalySessionId,
    checkoutSessionExpiresAt: order.checkoutSessionExpiresAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    refundAmount: order.refundAmount,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    refundReason: order.refundReason,
    subscriptionId: order.subscriptionId,
    subscriptionStatus: order.subscriptionStatus,
    hasActiveEntitlement: activeOrderIds.has(order.id),
    createdAt: order.createdAt?.toISOString() ?? new Date().toISOString(),
    planId: order.planId,
    planName: planNameMap.get(order.planId) ?? order.planId,
    userEmail: order.userEmail,
  }));

  return (
    <section aria-labelledby="local-orders-heading" className="space-y-4">
      <div>
        <h2 id="local-orders-heading" className="text-lg font-semibold text-text-primary">
          站內訂單
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          搜尋訂單編號、會員或商品，確認 CabAI 目前保存的交易狀態。
        </p>
      </div>
      <OrdersTable data={tableData} />
    </section>
  );
}

async function ProviderOrdersView() {
  const [allOrders, planNameMap] = await Promise.all([
    db
      .select({
        merchantOrderNumber: orders.merchantOrderNumber,
        planId: orders.planId,
      })
      .from(orders),
    buildPlanDisplayNameMap(),
  ]);

  const localPlanByMerchantOrderNumber = new Map<string, string>(
    allOrders.map((order) => [
      order.merchantOrderNumber,
      planNameMap.get(order.planId) ?? order.planId,
    ]),
  );

  const result = await listOrders({ limit: 50 });
  if ("error" in result && result.error) {
    return (
      <section aria-labelledby="provider-orders-heading" className="space-y-4">
        <ProviderHeading />
        <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-light p-6 text-sm text-danger">
          <p className="font-semibold">Portaly 對帳資料無法載入</p>
          <p className="mt-1">{result.error}</p>
          <p className="mt-2 text-text-secondary">
            站內訂單仍可正常查詢；請確認外部服務設定後再重試此檢視。
          </p>
        </div>
      </section>
    );
  }

  const portalyOrders = result.data ?? [];

  return (
    <section aria-labelledby="provider-orders-heading" className="space-y-4">
      <ProviderHeading />
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {["日期", "訂單編號", "本地商品", "客戶", "金額", "手續費", "淨收入", "付款方式", "狀態"].map((label) => (
                  <th key={label} className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {portalyOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-text-muted">
                    尚無 Portaly 金流紀錄
                  </td>
                </tr>
              )}
              {portalyOrders.map((order) => {
                const localPlanName = order.merchantOrderNumber
                  ? localPlanByMerchantOrderNumber.get(order.merchantOrderNumber)
                  : null;
                return (
                  <tr key={order.id} className="transition-colors hover:bg-surface-muted">
                    <td className="whitespace-nowrap px-6 py-4 text-text-muted">
                      {order.paidAt
                        ? new Date(order.paidAt).toLocaleDateString("zh-TW", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-text-secondary">
                      {order.merchantOrderNumber ?? order.id.slice(0, 12)}
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {localPlanName ?? <span className="text-text-muted">未對應本地訂單</span>}
                    </td>
                    <td className="px-6 py-4 text-text-secondary">{order.email ?? "-"}</td>
                    <td className="px-6 py-4 font-mono text-text-secondary">{formatPrice(order.amount)}</td>
                    <td className="px-6 py-4 font-mono text-text-muted">
                      {formatPrice((order.feeAmount ?? 0) + (order.taxFeeAmount ?? 0))}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-success">
                      {formatPrice(order.netTotal ?? order.amount)}
                    </td>
                    <td className="px-6 py-4 text-text-muted">{order.paymentMethod ?? "-"}</td>
                    <td className="px-6 py-4"><Badge variant="success">{order.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ProviderHeading() {
  return (
    <div>
      <h2 id="provider-orders-heading" className="text-lg font-semibold text-text-primary">
        Portaly 對帳
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        這個檢視會即時讀取 Portaly API，並依訂單編號對回本地商品。
      </p>
    </div>
  );
}
