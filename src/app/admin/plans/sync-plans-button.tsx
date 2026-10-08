"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncPlansAction } from "@/actions/plans";

export function SyncPlansButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncPlansAction();
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: `已同步 ${result?.synced ?? 0} 個方案` });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={handleSync} loading={isPending}>
        從 Portaly 同步
      </Button>
      {message && (
        <span className={`text-sm ${message.type === "error" ? "text-danger" : "text-success"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
