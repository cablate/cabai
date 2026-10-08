"use client";

import { useCallback, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkle } from "@phosphor-icons/react";
import { updateAutoMarkPreference } from "./actions";

/**
 * Toggle switch for auto-mark-complete preference.
 * Instantly reflects the new state (optimistic update), fires the server
 * action in background, and refreshes the page on completion.
 */
export function ToggleAutoMark({
  autoMarkEnabled,
}: {
  autoMarkEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(autoMarkEnabled);
  const router = useRouter();

  const handleToggle = useCallback(() => {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      await updateAutoMarkPreference(next);
      router.refresh();
    });
  }, [optimistic, setOptimistic, router]);

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={`
        relative inline-flex cursor-pointer items-center gap-1.5 rounded-full
        px-3 py-1.5 text-xs font-medium
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
        disabled:pointer-events-none disabled:opacity-60
        ${
          optimistic
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-surface-muted text-text-muted hover:bg-border-subtle"
        }
      `}
      title={
        optimistic ? "自動標記已完成 — 點擊改為手動" : "手動標記 — 點擊改為自動"
      }
      aria-label={
        optimistic ? "自動標記完成已開啟" : "自動標記完成已關閉"
      }
      aria-pressed={optimistic}
    >
      {optimistic ? (
        <Sparkle size={14} weight="fill" className="text-emerald-500" />
      ) : (
        <Check size={14} weight="bold" />
      )}
      <span>{optimistic ? "自動標記" : "手動標記"}</span>
    </button>
  );
}
