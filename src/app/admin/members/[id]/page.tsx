import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { users, userPurchases, orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAllLocalPlans, type LocalPlan } from "@/lib/plans-local";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { GrantAccessForm } from "./grant-form";
import { RevokeButton } from "./revoke-button";

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const grantLabels: Record<string, string> = {
  payment: "付款取得",
  manual: "手動授權",
  free_claim: "免費領取",
};

const defaultMemberOrderStatus = { label: "處理中", variant: "warning" } as const;
const statusConfig: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  pending: defaultMemberOrderStatus,
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失敗", variant: "danger" },
  canceled: { label: "已取消", variant: "default" },
  refunded: { label: "已退款", variant: "default" },
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    notFound();
  }

  // Fetch plans from local DB for name resolution
  const allPlansData = await getAllLocalPlans();
  const planMap = new Map<string, LocalPlan>();
  allPlansData.forEach((p) => planMap.set(p.id, p));

  const activePlans = allPlansData
    .filter((p) => p.status === "active")
    .map((p) => ({ id: p.id, name: p.name }));

  const purchases = await db
    .select()
    .from(userPurchases)
    .where(eq(userPurchases.userId, id))
    .orderBy(desc(userPurchases.grantedAt));

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, id))
    .orderBy(desc(orders.createdAt));

  return (
    <div className="space-y-8">
      <PageHeader title="會員詳情" />

      {/* User info */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-text-muted">名稱</p>
            <p className="mt-1 font-medium text-text-primary">
              {user.name ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-text-muted">Email</p>
            <p className="mt-1 font-medium text-text-primary">
              {user.email ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-text-muted">註冊日期</p>
            <p className="mt-1 font-medium text-text-primary">
              {formatDate(user.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Grant access form */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          手動授權商品
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          授權後，該會員即可存取對應商品內容
        </p>
        <div className="mt-4">
          <GrantAccessForm userId={user.id} products={activePlans} />
        </div>
      </div>

      {/* Current access */}
      <div className="rounded-2xl border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            已取得商品
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  商品
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  取得方式
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  授權日期
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  到期日
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {purchases.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-text-muted"
                  >
                    此會員尚未擁有任何商品。可透過上方「手動授權」表單授權，或等待會員完成購買。
                  </td>
                </tr>
              )}
              {purchases.map((p) => (
                <tr
                  key={p.id}
                  className="transition-colors hover:bg-surface-muted"
                >
                  <td className="px-6 py-4 font-medium text-text-primary">
                    {planMap.get(p.planId)?.name ?? p.planId}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {grantLabels[p.grantedBy] ?? p.grantedBy}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {formatDate(p.grantedAt)}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {p.expiresAt ? formatDate(p.expiresAt) : "永久"}
                  </td>
                  <td className="px-6 py-4">
                    {(!p.expiresAt || p.expiresAt > new Date()) && (
                      <RevokeButton
                        purchaseId={p.id}
                        userId={user.id}
                        planName={planMap.get(p.planId)?.name ?? p.planId}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order history */}
      <div className="rounded-2xl border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            訂單紀錄
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  日期
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  訂單編號
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  商品
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  金額
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  狀態
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {userOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-text-muted"
                  >
                    此會員尚無訂單。訂單會在會員透過 Portaly 完成付款後自動出現。
                  </td>
                </tr>
              )}
              {userOrders.map((order) => {
                const s = statusConfig[order.status] ?? defaultMemberOrderStatus;
                return (
                  <tr
                    key={order.id}
                    className="transition-colors hover:bg-surface-muted"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-text-muted">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-text-secondary">
                      {order.merchantOrderNumber}
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {planMap.get(order.planId)?.name ?? order.planId}
                    </td>
                    <td className="px-6 py-4 font-mono text-text-secondary">
                      {order.paidAmount != null
                        ? formatPrice(order.paidAmount)
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={s.variant}>{s.label}</Badge>
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
