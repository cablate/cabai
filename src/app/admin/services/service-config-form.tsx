"use client";

import { useActionState } from "react";
import { createServiceConfig, type ServiceConfigResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

const fieldLabels = { planId: "方案", serviceName: "服務名稱", webhookUrl: "Webhook URL" };

interface Props {
  plans: Array<{ id: string; name: string }>;
}

export function ServiceConfigForm({ plans }: Props) {
  const [state, formAction, pending] = useActionState<ServiceConfigResult, FormData>(
    createServiceConfig,
    null,
  );

  return (
    <div>
      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormErrorSummary feedback={state} fieldLabels={fieldLabels} className="sm:col-span-3" />
        <Select
          id="planId"
          name="planId"
          label="方案"
          required
          error={state?.fieldErrors?.planId?.[0]}
        >
          <option value="">選擇方案</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <Input
          id="serviceName"
          name="serviceName"
          label="服務名稱"
          placeholder="investment-monitor"
          required
          error={state?.fieldErrors?.serviceName?.[0]}
          helperText="只允許小寫字母、數字和連字號"
        />

        <Input
          id="webhookUrl"
          name="webhookUrl"
          label="Webhook URL"
          type="url"
          placeholder="https://..."
          required
          error={state?.fieldErrors?.webhookUrl?.[0]}
        />

        <div className="sm:col-span-3">
          <Button type="submit" loading={pending}>
            建立服務
          </Button>
        </div>
      </form>

      {state?.apiKey && (
        <div className="mt-4 rounded-lg border border-warning bg-warning-light p-4">
          <p className="text-sm font-medium text-warning">
            API Key 僅顯示一次，請立即複製：
          </p>
          <code className="mt-2 block break-all rounded bg-warning-light p-2 font-mono text-xs text-text-primary">
            {state.apiKey}
          </code>
        </div>
      )}
    </div>
  );
}
