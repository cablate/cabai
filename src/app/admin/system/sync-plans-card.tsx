"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { syncPlansAction } from "./actions";
import { toast } from "sonner";

export function SyncPlansCard() {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    try {
      const result = await syncPlansAction();
      if (result.success) {
        toast.success(result.message ?? "同步完成");
      } else {
        toast.error(result.error ?? "同步失敗");
      }
    } catch {
      toast.error("操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-medium text-text-primary mb-2">同步 Plans</h3>
      <p className="text-xs text-text-muted mb-4">
        從 Portaly 同步最新方案資訊
      </p>
      <Button
        onClick={handleSync}
        loading={loading}
        variant="primary"
        size="sm"
      >
        開始同步
      </Button>
    </Card>
  );
}
