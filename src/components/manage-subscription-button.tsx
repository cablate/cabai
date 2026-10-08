"use client";

import { useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { toast } from "sonner";

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = await res.json();
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        toast.error(data.error || "無法開啟訂閱管理頁面");
        setLoading(false);
      }
    } catch {
      toast.error("網路錯誤，請稍後再試");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-secondary transition-[background-color,border-color,color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border-strong hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
    >
      <Gear size={15} weight="bold" />
      {loading ? "開啟中..." : "管理訂閱"}
    </button>
  );
}
