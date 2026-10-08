"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updatePlanCheckoutAction } from "./actions";
import type { Plan } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { FormErrorSummary, type FormActionFeedback } from "@/components/ui/form-feedback";

interface CheckoutFormProps {
  plan: Plan;
}

export function CheckoutForm({ plan }: CheckoutFormProps) {
  const [mode, setMode] = useState<"internal" | "external" | "disabled" | "free_claim">(
    (plan.purchaseButtonMode as "internal" | "external" | "disabled" | "free_claim") ?? "internal"
  );
  const [externalUrl, setExternalUrl] = useState(plan.externalCheckoutUrl ?? "");
  const [externalLabel, setExternalLabel] = useState(plan.externalCheckoutLabel ?? "");
  const [newTab, setNewTab] = useState(plan.externalCheckoutNewTab ?? true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FormActionFeedback | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const input =
        mode === "external"
          ? {
              purchaseButtonMode: "external" as const,
              externalCheckoutUrl: externalUrl,
              externalCheckoutLabel: externalLabel || undefined,
              externalCheckoutNewTab: newTab,
            }
          : mode === "disabled"
            ? { purchaseButtonMode: "disabled" as const }
            : mode === "free_claim"
              ? { purchaseButtonMode: "free_claim" as const }
              : { purchaseButtonMode: "internal" as const };

      const result = await updatePlanCheckoutAction(plan.id, input);
      if (result.success) {
        toast.success("結帳設定已儲存");
      } else {
        const error = result.error ?? "儲存失敗";
        setFeedback({ error });
        toast.error(error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormErrorSummary feedback={feedback} fieldLabels={{}} />
      {/* Mode selection */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-text-primary mb-3">購買按鈕行為</legend>
        {(["internal", "external", "disabled", "free_claim"] as const).map((value) => (
          <label key={value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="purchaseButtonMode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="mt-0.5 h-4 w-4 accent-ink"
            />
            <span className="text-sm text-text-secondary">
              {value === "internal" && (
                <>
                  <span className="font-medium text-text-primary">站內 checkout（預設）</span>
                  <br />
                  <span className="text-text-muted text-xs">導向站內 /checkout/[planId] 完成付款</span>
                </>
              )}
              {value === "external" && (
                <>
                  <span className="font-medium text-text-primary">外連購買</span>
                  <br />
                  <span className="text-text-muted text-xs">CTA 按鈕直接打開外部 URL（如 Portaly 商店頁）</span>
                </>
              )}
              {value === "disabled" && (
                <>
                  <span className="font-medium text-text-primary">停售 / 隱藏按鈕</span>
                  <br />
                  <span className="text-text-muted text-xs">方案保留但不提供購買入口</span>
                </>
              )}
              {value === "free_claim" && (
                <>
                  <span className="font-medium text-text-primary">免費領取</span>
                  <br />
                  <span className="text-text-muted text-xs">登入用戶按 CTA 即發放權益，不經 Portaly 也不寫 orders</span>
                </>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {/* External URL fields — only shown when external is selected */}
      {mode === "external" && (
        <div className="space-y-4 rounded-lg border border-border-subtle bg-surface-muted p-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary" htmlFor="externalUrl">
              外部購買連結 <span className="text-danger">*</span>
            </label>
            <input
              id="externalUrl"
              type="url"
              required
              placeholder="https://portaly.ai/store/..."
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <p className="text-xs text-text-muted">必須為完整 URL，含 https://</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary" htmlFor="externalLabel">
              按鈕文字（選填）
            </label>
            <input
              id="externalLabel"
              type="text"
              placeholder="前往購買"
              value={externalLabel}
              onChange={(e) => setExternalLabel(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <p className="text-xs text-text-muted">
              留空則 fallback 到展示頁的 CTA 文字，再 fallback 到「前往購買」
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="newTab"
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <label htmlFor="newTab" className="text-sm text-text-primary cursor-pointer">
              在新分頁開啟（建議勾選）
            </label>
          </div>
        </div>
      )}

      <div>
        <Button
          type="submit"
          loading={saving}
        >
          儲存設定
        </Button>
      </div>
    </form>
  );
}
