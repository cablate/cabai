"use client";

import { useActionState } from "react";
import { createPlan, type CreatePlanResult } from "@/actions/plans";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

const fieldLabels = {
  name: "方案名稱",
  description: "方案描述",
  amount: "金額",
  billingPeriod: "帳單週期",
  pricingType: "定價模式",
  gateway: "金流管道",
  providerPlanId: "Portaly Provider Plan ID",
};

export function CreatePlanForm() {
  const [state, formAction, pending] = useActionState<CreatePlanResult, FormData>(
    createPlan,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} />
      <Input
        id="name"
        name="name"
        label="方案名稱"
        placeholder="例：Python 入門課程"
        required
        error={state?.fieldErrors?.name?.[0]}
      />

      <Input
        id="description"
        name="description"
        label="方案描述"
        placeholder="選填"
        error={state?.fieldErrors?.description?.[0]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="amount"
          name="amount"
          label="金額（TWD）"
          type="number"
          min={0}
          placeholder="0"
          required
          error={state?.fieldErrors?.amount?.[0]}
        />

        <Select
          id="billingPeriod"
          name="billingPeriod"
          label="帳單週期"
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
          error={state?.fieldErrors?.pricingType?.[0]}
        >
          <option value="fixed">固定價格</option>
          <option value="dynamic">自訂金額</option>
        </Select>

        <Select
          id="gateway"
          name="gateway"
          label="金流管道"
          helperText="Portaly Vibe = 同步建立到 Portaly，可走 Portaly checkout。Manual = 僅本地管理"
          error={state?.fieldErrors?.gateway?.[0]}
        >
          <option value="manual">Manual（本地管理）</option>
          <option value="portaly">Portaly Vibe</option>
        </Select>
      </div>

      <Input
        id="providerPlanId"
        name="providerPlanId"
        label="Portaly Provider Plan ID（選填）"
        placeholder="plan_xxx"
        helperText="Provider plan 決定 Portaly 端的付款行為；本地商品仍負責課程、交付與權限。留空則沿用原本建立 Portaly plan 的流程。目前共用 provider plan 只支援 one-time checkout。"
        error={state?.fieldErrors?.providerPlanId?.[0]}
      />

      <input type="hidden" name="currency" value="TWD" />

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={pending}>
          建立方案
        </Button>
      </div>
    </form>
  );
}
