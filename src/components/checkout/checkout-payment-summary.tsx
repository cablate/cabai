import Image from "next/image";
import { ArrowRight, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Plan } from "@/lib/db/schema";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DynamicAmountInput } from "./dynamic-amount-input";

type CheckoutBuyer = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const billingLabels: Record<Plan["billingPeriod"], string> = {
  "one-time": "單次購買",
  monthly: "每月訂閱",
  yearly: "每年訂閱",
};

function priceLabel(plan: Plan): string {
  const amount = formatPrice(plan.amount);
  if (plan.billingPeriod === "monthly") return `${amount}／月`;
  if (plan.billingPeriod === "yearly") return `${amount}／年`;
  return amount;
}

export function CheckoutPaymentSummary({
  plan,
  productName,
  buyer,
  providerMode,
}: {
  plan: Plan;
  productName: string;
  buyer: CheckoutBuyer;
  providerMode: "test" | "live";
}) {
  const isDynamic = plan.pricingType === "dynamic";
  const isDisabled = plan.purchaseButtonMode === "disabled";
  const amount = priceLabel(plan);

  return (
    <aside className="lg:sticky lg:top-[calc(var(--site-header-height)+1.5rem)] lg:self-start">
      <section aria-labelledby="checkout-payment-summary" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
        <div className="border-b border-border-subtle px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="checkout-payment-summary" className="text-lg font-semibold text-text-primary">
              付款摘要
            </h2>
            {providerMode === "test" ? (
              <Badge variant="warning">測試付款</Badge>
            ) : (
              <Badge variant="success">Portaly 安全付款</Badge>
            )}
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary [text-wrap:pretty]">
            {productName}
          </p>
          <p className="mt-1 text-xs text-text-muted">{billingLabels[plan.billingPeriod]}</p>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          {isDynamic ? (
            <DynamicAmountInput />
          ) : (
            <div className="flex items-end justify-between gap-4 border-b border-border-subtle pb-5">
              <span className="text-sm text-text-muted">應付金額</span>
              <strong className="text-right font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">
                {amount}
              </strong>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-text-muted">內容將開通至</p>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              {buyer.image ? (
                <Image
                  src={buyer.image}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-secondary ring-1 ring-border" aria-hidden="true">
                  {(buyer.name?.[0] ?? "U").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{buyer.name ?? "使用者"}</p>
                <p className="truncate text-xs text-text-muted">{buyer.email ?? "尚無 Email"}</p>
              </div>
            </div>
          </div>

          {providerMode === "test" ? (
            <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-light p-4 text-sm leading-6 text-text-secondary">
              <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <p><strong className="text-text-primary">這是測試付款。</strong>請勿把此頁當成正式收款流程。</p>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-success/20 bg-success-light p-4 text-sm leading-6 text-text-secondary">
              <ShieldCheck size={20} weight="duotone" className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="font-semibold text-text-primary">下一步會離開 CabAI</p>
                <p className="mt-1 text-xs leading-5">
                  Portaly 可能顯示 CabAI 的共用付款方案名稱；你的訂單仍會依本頁商品、金額與帳號建立。若下一頁金額不同，請不要付款並返回本站。
                </p>
              </div>
            </div>
          )}

          {isDisabled ? (
            <div className="rounded-xl border border-border bg-surface-muted p-5 text-center">
              <p className="text-sm font-medium text-text-primary">此方案目前無法購買</p>
              <p className="mt-2 text-xs leading-5 text-text-muted">此方案暫停販售，如有疑問請聯繫我們。</p>
            </div>
          ) : (
            <form method="POST" action="/api/checkout" className="space-y-3">
              <input type="hidden" name="planId" value={plan.id} />
              <Button type="submit" size="lg" className="w-full">
                <span>{isDynamic ? "前往 Portaly 安全付款" : `前往 Portaly 安全付款 · ${amount}`}</span>
                <ArrowRight size={17} weight="bold" data-icon="inline-end" aria-hidden="true" />
              </Button>
              <p className="text-center text-xs leading-5 text-text-muted">
                付款完成後會回到 CabAI 確認訂單與內容開通狀態。
              </p>
            </form>
          )}
        </div>
      </section>
    </aside>
  );
}
