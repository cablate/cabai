"use client";

import { useActionState } from "react";
import { grantAccess, type GrantAccessResult } from "@/actions/members";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

export function GrantAccessForm({
  userId,
  products,
}: {
  userId: string;
  products: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<GrantAccessResult, FormData>(
    grantAccess,
    null,
  );

  if (products.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        目前沒有上架中的方案可供授權
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="userId" value={userId} />

      <FormErrorSummary
        feedback={state}
        fieldLabels={{ planId: "方案" }}
        className="sm:col-span-2"
      />

      <div>
        <Select
          id="planId"
          name="planId"
          label="選擇方案"
          required
          error={state?.fieldErrors?.planId?.[0]}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" loading={pending}>
        授權
      </Button>

    </form>
  );
}
