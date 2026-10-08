"use client";

import { useState, useCallback } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";

/**
 * Client component: refresh Discord roles button with loading state.
 *
 * POSTs to /api/discord/refresh-roles and shows a spinner while the
 * request is in flight. The API is idempotent — repeated clicks are safe.
 */
export function RefreshRolesButton() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setDone(false);
    try {
      const res = await fetch("/api/discord/refresh-roles", { method: "POST" });
      if (res.ok) {
        setDone(true);
        setTimeout(() => setDone(false), 3000);
      }
    } catch {
      // Silent fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:cursor-wait disabled:opacity-50 ${
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-border bg-surface text-text-secondary hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      <ArrowsClockwise
        size={14}
        className={loading ? "animate-spin motion-reduce:animate-none" : undefined}
      />
      {loading ? "同步中..." : done ? "已同步 ✓" : "重新整理角色"}
    </button>
  );
}
