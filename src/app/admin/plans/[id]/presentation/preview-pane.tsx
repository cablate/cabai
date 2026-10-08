"use client";

import type { Plan } from "@/lib/db/schema";
import { formatPrice } from "@/lib/utils";

interface PreviewPaneProps {
  formData: Record<string, unknown>;
  plan: Plan;
}

const billingLabels: Record<string, string> = {
  monthly: "每月",
  yearly: "每年",
  "one-time": "一次付費",
};

const typeLabels: Record<string, string> = {
  course: "線上課程",
  lecture: "線上講座",
  free_event: "免費活動",
  offline_event: "線下活動",
  service: "服務方案",
  membership: "會員訂閱",
  download: "下載資源",
};

export default function PreviewPane({ formData, plan }: PreviewPaneProps) {
  const title = (formData.title as string) || plan.name;
  const subtitle = formData.subtitle as string;
  const offeringType = (formData.offeringType as string) || "course";
  const ctaLabel = (formData.ctaLabel as string) || "查看詳情";

  return (
    <aside className="sticky top-24 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">前台預覽</h3>
        <p className="mt-1 text-xs text-text-muted">
          預覽列表卡與購買卡的主要資訊。
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="relative h-40 bg-ink">
          {formData.coverImage ? (
            <div className="flex h-full items-center justify-center bg-surface-muted text-xs text-text-muted">
              使用自訂封面圖
            </div>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(246,217,143,0.2),transparent_32%),linear-gradient(145deg,#191713_0%,#0f1f1d_55%,#12100d_100%)]" />
          )}
          <span className="absolute right-4 top-4 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-white/75">
            {typeLabels[offeringType] ?? offeringType}
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <h4 className="text-lg font-semibold text-text-primary">{title}</h4>
            {subtitle && (
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {subtitle}
              </p>
            )}
          </div>

          <div className="border-t border-border-subtle pt-4">
            <p className="text-xs text-text-muted">價格</p>
            <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
              {formatPrice(plan.amount)}
              <span className="ml-2 text-xs font-normal text-text-muted">
                {billingLabels[plan.billingPeriod] ?? plan.billingPeriod}
              </span>
            </p>
          </div>

          <div className="rounded-md bg-ink px-4 py-2.5 text-center text-sm font-medium text-white">
            {ctaLabel}
          </div>
        </div>
      </div>
    </aside>
  );
}
