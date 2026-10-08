"use client";

import Link from "next/link";
import Image from "next/image";
import { cn, formatPrice } from "@/lib/utils";
import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { LocalPlan } from "@/lib/plans-local";
import { planPath } from "@/lib/plan-url";
import { BRAND_NAME } from "@/lib/constants";
import { getBillingLabel } from "@/lib/public-offering-copy";
import { resolveProductAcquisitionState } from "@/lib/product-discovery";

const billingLabels: Record<string, string> = {
  "one-time": "線上課程",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

const coverAccents = [
  "bg-amber-soft/14 border-amber-soft/34",
  "bg-teal-200/14 border-teal-200/34",
  "bg-white/10 border-white/22",
];

export function ProductCard({
  plan,
  index = 0,
  alreadyPurchased = false,
}: {
  plan: LocalPlan;
  index?: number;
  alreadyPurchased?: boolean;
}) {
  const typeLabel = billingLabels[plan.billingPeriod] ?? "線上課程";
  const productNumber = String(index + 1).padStart(2, "0");
  const isFreeAccess = plan.purchaseButtonMode === "free_claim";
  const priceLabel = isFreeAccess
    ? getBillingLabel(plan.billingPeriod, true)
    : plan.billingPeriod === "monthly"
      ? "每月"
      : plan.billingPeriod === "yearly"
        ? "每年"
        : "一次付款";

  const acquisitionState = resolveProductAcquisitionState({
    alreadyPurchased,
    status: plan.status,
    amount: isFreeAccess ? 0 : plan.amount,
  });
  // 列表卡片只負責導航：購買流程交給詳情頁右側 CTA
  const ctaText = {
    owned: "進入內容",
    unavailable: "查看資訊",
    free: "免費取得",
    paid: "查看方案",
  }[acquisitionState];
  const ctaHref = acquisitionState === "owned" ? planPath(plan, "my") : planPath(plan, "product");
  const showAsDisabled = acquisitionState === "unavailable";

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      <Link prefetch={false} href={ctaHref} className="group block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <article className="grid overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-card transition-[border-color,box-shadow,transform] duration-300 hover:border-ink/35 group-focus-visible:-translate-y-0.5 group-focus-visible:border-border-strong group-focus-visible:shadow-elevated md:grid-cols-[14rem_1fr]">
          <div className="relative min-h-52 overflow-hidden bg-ink md:min-h-64">
            {plan.image ? (
              <Image
                src={plan.image}
                alt={plan.name}
                fill
                className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 14rem"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(246,217,143,0.2),transparent_32%),linear-gradient(145deg,#191713_0%,#0f1f1d_55%,#12100d_100%)]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(21,19,15,0.04)_0%,rgba(21,19,15,0.76)_100%)]" />

            <div className="absolute left-5 top-5 rounded-md border border-white/14 bg-white/8 px-2.5 py-1 font-mono text-xs text-white/58">
              #{productNumber}
            </div>
            <div className="absolute bottom-5 left-5 right-5">
              <div className={cn("rounded-md border p-4", coverAccents[index % coverAccents.length])}>
                <p className="font-mono text-xs text-white/52">{BRAND_NAME}</p>
                <p className="mt-2 text-lg font-semibold text-white">{typeLabel}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between p-5 md:min-h-64 md:p-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  {alreadyPurchased && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle size={12} weight="fill" />
                      已擁有
                    </span>
                  )}
                  <h3 className="mt-2 text-xl font-semibold text-text-primary">
                    {plan.name}
                  </h3>
                </div>
                <span className="shrink-0 rounded-md border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary">
                  {typeLabel}
                </span>
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-text-secondary">
                {plan.description || "點進商品頁查看內容、價格與購買方式。"}
              </p>
            </div>

            <div className="mt-8 border-t border-border-subtle pt-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="block text-xs text-text-muted">
                    {showAsDisabled ? "取得狀態" : priceLabel}
                  </span>
                  <span className="mt-1 block font-mono text-lg font-semibold text-text-primary">
                    {showAsDisabled ? "目前無法取得" : isFreeAccess ? "免費" : formatPrice(plan.amount)}
                  </span>
                </div>
                {showAsDisabled ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
                      "bg-surface-muted text-sm font-medium text-text-muted",
                    )}
                  >
                    {ctaText}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
                      "bg-ink text-sm font-medium text-white",
                      "transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      "group-hover:bg-zinc-800 group-focus-visible:bg-zinc-800 group-active:scale-[0.98]",
                    )}
                  >
                    {ctaText}
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-px">
                      <ArrowUpRight size={14} weight="bold" />
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}
