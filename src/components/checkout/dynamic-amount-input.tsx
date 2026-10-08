"use client";

import { useState } from "react";

export function DynamicAmountInput() {
  const [amount, setAmount] = useState("");

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-muted/45 p-4">
      <label htmlFor="amount" className="block text-sm font-medium text-text-primary">
        付款金額
      </label>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        請輸入這次要支付的整數金額。
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm font-medium text-text-muted">NT$</span>
        <input
          id="amount"
          name="amount"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          enterKeyHint="done"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="輸入金額"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>
      {amount && Number(amount) > 0 ? (
        <p className="mt-3 text-right font-display text-xl font-medium text-text-primary" aria-live="polite">
          NT${Math.round(Number(amount)).toLocaleString("zh-TW")}
        </p>
      ) : null}
    </div>
  );
}
