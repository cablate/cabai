"use client";

import { useTransition } from "react";
import { togglePlanStatus } from "@/actions/plans";
import { toast } from "sonner";

export function PlanStatusToggle({
  planId,
  currentStatus,
}: {
  planId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const isActive = currentStatus === "active";

  function handleToggle() {
    startTransition(async () => {
      const result = await togglePlanStatus(planId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.status === "active" ? "已上架" : "已下架");
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive ? "bg-emerald-500" : "bg-zinc-300"
      }`}
      role="switch"
      aria-checked={isActive}
      aria-label={isActive ? "下架方案" : "上架方案"}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
          isActive ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
