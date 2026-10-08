"use client";

import { useState } from "react";

export function SyncPlansButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setState("loading");
    try {
      const res = await fetch("/api/admin/sync-plans", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "同步失敗");
        return;
      }
      setState("done");
      setMessage(`同步完成，共 ${data.synced} 個方案`);
      setTimeout(() => location.reload(), 1500);
    } catch {
      setState("error");
      setMessage("網路錯誤");
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === "loading"}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
    >
      {state === "loading" ? "同步中..." : "同步 Portaly 方案"}
      {state === "done" && <span className="ml-2 text-xs text-green-600">{message}</span>}
      {state === "error" && <span className="ml-2 text-xs text-red-600">{message}</span>}
    </button>
  );
}
