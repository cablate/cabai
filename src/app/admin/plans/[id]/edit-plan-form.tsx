"use client";

import { useActionState, useState } from "react";
import { updatePlan, type UpdatePlanResult } from "@/actions/plans";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

const fieldLabels = {
  name: "方案名稱",
  description: "方案描述",
  slug: "公開網址 Slug",
  amount: "金額",
  billingPeriod: "帳單週期",
  pricingType: "定價模式",
  status: "狀態",
  gateway: "金流管道",
  providerPlanId: "Portaly Provider Plan ID",
};

interface EditPlanFormProps {
  plan: {
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    amount: number;
    billingPeriod: string;
    pricingType: string | null;
    status: string;
    providerPlanId: string | null;
  };
  gateway: "portaly" | "manual";
}

export function EditPlanForm({ plan, gateway }: EditPlanFormProps) {
  const [selectedGateway, setSelectedGateway] = useState<"portaly" | "manual">(gateway);
  const boundAction = updatePlan.bind(null, plan.id);
  const [state, formAction, pending] = useActionState<UpdatePlanResult, FormData>(
    boundAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} />
      <Input
        id="name"
        name="name"
        label="方案名稱"
        defaultValue={plan.name}
        required
        error={state?.fieldErrors?.name?.[0]}
      />

      <Input
        id="description"
        name="description"
        label="方案描述"
        defaultValue={plan.description ?? ""}
        error={state?.fieldErrors?.description?.[0]}
      />

      <div>
        <Input
          id="slug"
          name="slug"
          label="網址 Slug（選填）"
          defaultValue={plan.slug ?? ""}
          placeholder="例：cc-deep-engineering"
          error={state?.fieldErrors?.slug?.[0]}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          填寫後 `/products/...`、`/checkout/...`、`/my/...` 三條路徑可用此 slug 取代 UUID。留空則只用 UUID。改變 slug 會讓舊網址失效。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="amount"
          name="amount"
          label="金額（TWD）"
          type="number"
          min={0}
          defaultValue={plan.amount}
          required
          error={state?.fieldErrors?.amount?.[0]}
        />

        <Select
          id="billingPeriod"
          name="billingPeriod"
          label="帳單週期"
          defaultValue={plan.billingPeriod}
          required
          error={state?.fieldErrors?.billingPeriod?.[0]}
        >
          <option value="one-time">一次性</option>
          <option value="monthly">月訂閱</option>
          <option value="yearly">年訂閱</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          id="pricingType"
          name="pricingType"
          label="定價模式"
          defaultValue={plan.pricingType ?? "fixed"}
          error={state?.fieldErrors?.pricingType?.[0]}
        >
          <option value="fixed">固定價格</option>
          <option value="dynamic">自訂金額</option>
        </Select>

        <Select
          id="status"
          name="status"
          label="狀態"
          defaultValue={plan.status}
          error={state?.fieldErrors?.status?.[0]}
        >
          <option value="active">上架中</option>
          <option value="inactive">未上架</option>
        </Select>
      </div>

      {gateway === "manual" ? (
        <fieldset className="space-y-3 rounded-lg border border-border-subtle bg-surface-muted p-5">
          <legend className="px-1 text-sm font-medium text-text-primary">金流管道</legend>
          <p className="text-sm text-text-muted">
            轉換只會建立 CabAI 與既有 Portaly 方案的對應，不會在 Portaly 新增或修改方案。
          </p>
          {([
            ["manual", "維持 Manual", "保留目前的外部購買或管理員授權流程。"],
            ["portaly", "轉換為 Portaly", "驗證 Provider Plan ID 後，讓此商品可使用 CabAI 站內結帳。"],
          ] as const).map(([value, label, description]) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-border-strong"
            >
              <input
                type="radio"
                name="gateway"
                value={value}
                checked={selectedGateway === value}
                onChange={() => setSelectedGateway(value)}
                className="mt-0.5 h-4 w-4 accent-ink"
                aria-controls="provider-plan-fields"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">{label}</span>
                <span className="mt-1 block text-xs text-text-muted">{description}</span>
              </span>
            </label>
          ))}
          {state?.fieldErrors?.gateway?.[0] && (
            <p className="text-sm text-danger" role="alert">
              {state.fieldErrors.gateway[0]}
            </p>
          )}
        </fieldset>
      ) : (
        <input type="hidden" name="gateway" value="portaly" />
      )}

      {selectedGateway === "portaly" && (
        <div id="provider-plan-fields">
          <Input
            id="providerPlanId"
            name="providerPlanId"
            label={gateway === "manual" ? "Portaly Provider Plan ID" : "Portaly Provider Plan ID（選填）"}
            defaultValue={plan.providerPlanId ?? ""}
            placeholder={plan.id}
            helperText="Provider plan 決定 Portaly 端的付款行為；本地商品仍負責課程、交付與權限。使用共用 provider plan 時只更新本地設定，不會改動 provider plan。目前共用 provider plan 只支援 one-time checkout。"
            required={gateway === "manual"}
            error={state?.fieldErrors?.providerPlanId?.[0]}
          />
        </div>
      )}

      {state?.success && (
        <div className="rounded-lg bg-success/10 border border-success/20 px-4 py-3">
          <p className="text-sm text-success">
            {selectedGateway === "portaly" ? "Portaly 設定已驗證並儲存" : "方案已更新"}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {gateway === "manual" && selectedGateway === "portaly"
            ? "驗證並轉換為 Portaly"
            : gateway === "portaly" && plan.providerPlanId === plan.id
              ? "儲存並同步到 Portaly"
              : "儲存變更"}
        </Button>
      </div>
    </form>
  );
}
