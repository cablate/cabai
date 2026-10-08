"use client";

import { useState } from "react";
import { CaretDown, CreditCard, Receipt } from "@phosphor-icons/react";

interface OrderData {
  id: string;
  merchantOrderNumber: string | null;
  planName: string;
  paymentMethod: string | null;
  paidAmount: number | null;
  status: string;
  statusLabel: string;
  statusClassName: string;
  createdAt: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean | null;
}

export function OrderRow({ order }: { order: OrderData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer transition-colors duration-200 hover:bg-surface-muted/30 active:bg-surface-muted/50"
        aria-expanded={expanded}
      >
        <td className="px-6 py-4 text-text-secondary whitespace-nowrap">
          {order.createdAt}
        </td>
        <td className="px-6 py-4">
          <span className="font-medium text-text-primary">
            {order.planName}
          </span>
          {order.paymentMethod && (
            <span className="ml-2 text-xs text-text-muted">
              {order.paymentMethod}
            </span>
          )}
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">
              {order.merchantOrderNumber ?? order.id.slice(0, 12)}
            </span>
            <CaretDown
              size={12}
              weight="bold"
              className={`text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          {order.paidAmount != null ? (
            <span className="font-mono text-sm font-medium text-text-primary">
              NT${order.paidAmount.toLocaleString("zh-TW")}
            </span>
          ) : (
            <span className="font-mono text-sm text-text-muted">&mdash;</span>
          )}
        </td>
        <td className="px-6 py-4 text-center">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${order.statusClassName}`}
          >
            {order.statusLabel}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-surface-muted/30 px-6 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-4">
              <Detail label="訂單 ID" value={order.id.slice(0, 12)} />
              <Detail label="付款方式" value={order.paymentMethod ?? "—"} />
              {order.subscriptionId && (
                <>
                  <Detail label="訂閱狀態" value={order.subscriptionStatus ?? "—"} />
                  <Detail label="下次扣款" value={order.nextBillingAt ?? "—"} />
                  {order.cancelAtPeriodEnd && (
                    <Detail label="備註" value="到期後不續訂" />
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function OrderCard({ order }: { order: OrderData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      className="block w-full cursor-pointer p-5 text-left transition-colors hover:bg-surface-muted/30 active:bg-surface-muted/50"
      onClick={() => setExpanded(!expanded)}
      aria-expanded={expanded}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="flex min-w-0 items-start gap-2 font-medium text-sm text-text-primary leading-snug">
          <Receipt size={16} weight="duotone" className="mt-0.5 shrink-0 text-text-muted" />
          <span className="min-w-0">{order.planName}</span>
        </span>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${order.statusClassName}`}
        >
          {order.statusLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">{order.createdAt}</span>
        {order.paidAmount != null && (
          <span className="font-mono text-sm font-medium text-text-primary">
            NT${order.paidAmount.toLocaleString("zh-TW")}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-text-muted">
          {order.merchantOrderNumber ?? order.id.slice(0, 12)}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
          {expanded ? "收合" : "細節"}
          <CaretDown
            size={11}
            weight="bold"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-xs">
          <Detail
            label="付款方式"
            value={order.paymentMethod ?? "—"}
            icon={<CreditCard size={12} weight="duotone" />}
          />
          {order.subscriptionId && (
            <>
              <Detail label="訂閱狀態" value={order.subscriptionStatus ?? "—"} />
              <Detail label="下次扣款" value={order.nextBillingAt ?? "—"} />
            </>
          )}
        </div>
      )}
    </button>
  );
}

function Detail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <span className="inline-flex items-center gap-1 text-text-muted">
        {icon}
        {label}
      </span>
      <p className="mt-0.5 font-medium text-text-secondary">{value}</p>
    </div>
  );
}
