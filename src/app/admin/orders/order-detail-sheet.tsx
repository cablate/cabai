"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  CheckCircle,
  Copy,
  CreditCard,
  ShieldCheck,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { OrderRow } from "./orders-table";

const PORTALY_ADMIN_URL = "https://portaly.cc/admin/creator-subscription";

const statusLabels: Record<string, string> = {
  pending: "處理中",
  completed: "已完成",
  failed: "失敗",
  canceled: "已取消",
  refunded: "已退款",
  expired: "已過期",
};

function display(value: string | null | undefined): string {
  return value?.trim() || "尚無證據";
}

function formatDate(value: string | null): string {
  if (!value) return "尚無證據";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚無證據";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null) return "尚無證據";
  return `${currency} ${amount.toLocaleString("zh-TW")}`;
}

export function buildOrderReconciliationText(order: OrderRow): string {
  const currency = order.expectedCurrency ?? order.currency;
  return [
    `CabAI 訂單：${order.merchantOrderNumber}`,
    `Local order ID：${order.id}`,
    `Local plan ID：${order.planId}`,
    `Portaly mode：${order.providerMode ?? "unknown"}`,
    `Portaly plan ID：${order.providerPlanId ?? "unknown"}`,
    `Portaly session ID：${order.portalySessionId ?? "unknown"}`,
    `金額：${formatMoney(order.paidAmount ?? order.expectedAmount, currency)}`,
    `CabAI 狀態：${order.status}`,
  ].join("\n");
}

export function OrderDetailSheet({ order }: { order: OrderRow }) {
  const [copied, setCopied] = useState(false);
  const currency = order.expectedCurrency ?? order.currency;
  const amount = order.paidAmount ?? order.expectedAmount;
  const statusLabel = statusLabels[order.status] ?? order.status;

  async function copyReconciliationData() {
    try {
      await navigator.clipboard.writeText(buildOrderReconciliationText(order));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          查看詳情
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full max-w-xl overflow-y-auto bg-surface text-text-primary"
      >
        <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface/95 px-5 py-5 backdrop-blur sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={order.status === "completed" ? "success" : "default"}>
                  {statusLabel}
                </Badge>
                <EnvironmentBadge mode={order.providerMode} />
              </div>
              <SheetTitle className="text-xl font-semibold text-text-primary">
                {order.planName}
              </SheetTitle>
              <SheetDescription className="mt-1 break-all text-sm text-text-muted">
                {order.merchantOrderNumber}
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="關閉訂單詳情">
                <X size={18} aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
        </header>

        <div className="space-y-5 px-5 py-6 sm:px-7">
          <section aria-labelledby={`order-summary-${order.id}`} className="rounded-2xl border border-border-subtle bg-surface-muted/45 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id={`order-summary-${order.id}`} className="text-xs font-medium text-text-muted">實際付款／預計付款</h3>
                <p className="mt-1 font-display text-2xl font-medium text-text-primary">
                  {formatMoney(amount, currency)}
                </p>
              </div>
              <CreditCard size={24} weight="duotone" className="text-accent" aria-hidden="true" />
            </div>
            <dl className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
              <Detail label="付款方式" value={display(order.paymentMethod)} />
              <Detail label="內容權限" value={order.hasActiveEntitlement ? "目前有效" : "目前未開通或已撤銷"} />
              <Detail label="建立時間" value={formatDate(order.createdAt)} />
              <Detail label="最後更新" value={formatDate(order.updatedAt)} />
            </dl>
          </section>

          <DetailSection title="CabAI 訂單" icon={<ShieldCheck size={18} weight="duotone" aria-hidden="true" />}>
            <Detail label="客戶帳號" value={display(order.userEmail)} />
            <Detail label="Local plan ID" value={order.planId} mono />
            <Detail label="Local order ID" value={order.id} mono />
            <Detail label="訂閱狀態" value={display(order.subscriptionStatus)} />
          </DetailSection>

          <DetailSection title="Portaly 付款證據" icon={<CreditCard size={18} weight="duotone" aria-hidden="true" />}>
            <Detail label="付款環境" value={order.providerMode === "live" ? "正式環境" : order.providerMode === "test" ? "測試環境" : "尚無證據"} />
            <Detail label="Provider plan ID" value={display(order.providerPlanId)} mono />
            <Detail label="Session ID" value={display(order.portalySessionId)} mono />
            <Detail label="Session 到期時間" value={formatDate(order.checkoutSessionExpiresAt)} />
          </DetailSection>

          {order.refundedAt && (
            <DetailSection title="退款紀錄" icon={<CheckCircle size={18} weight="duotone" aria-hidden="true" />}>
              <Detail label="退款時間" value={formatDate(order.refundedAt)} />
              <Detail label="退款金額" value={formatMoney(order.refundAmount, currency)} />
              <Detail label="退款原因" value={display(order.refundReason)} />
            </DetailSection>
          )}

          <section aria-labelledby={`order-actions-${order.id}`} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5">
            <div>
              <h3 id={`order-actions-${order.id}`} className="font-semibold text-text-primary">對帳工具</h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                複製最小必要識別資料，再到 Portaly 後台核對；不會包含客戶 Email 或任何金鑰。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="flex-1" onClick={copyReconciliationData}>
                <Copy size={16} aria-hidden="true" />
                {copied ? "已複製" : "複製核對資料"}
              </Button>
              <Button asChild variant="secondary" className="flex-1">
                <Link prefetch={false} href={PORTALY_ADMIN_URL} target="_blank" rel="noreferrer">
                  <ArrowSquareOut size={16} aria-hidden="true" />
                  前往 Portaly 後台
                </Link>
              </Button>
            </div>
          </section>

          <aside className="flex gap-3 rounded-2xl border border-warning/25 bg-warning-light p-4 text-sm leading-6 text-text-secondary">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-semibold text-text-primary">退款仍由 Portaly 正式管道處理</p>
              <p className="mt-1">
                本頁不會發動退款或提前撤銷權限。Portaly 完成退款並送達可信付款證據後，CabAI 才會更新訂單與權限。
              </p>
            </div>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EnvironmentBadge({ mode }: { mode: OrderRow["providerMode"] }) {
  if (mode === "live") return <Badge variant="success">Live</Badge>;
  if (mode === "test") return <Badge variant="warning">Test</Badge>;
  return <Badge variant="default">環境未知</Badge>;
}

function DetailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold text-text-primary">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-text-secondary ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
