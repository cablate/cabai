"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rebuildOrdersAction } from "./actions";
import { toast } from "sonner";

export function RebuildOrdersCard() {
  const [loading, setLoading] = useState(false);

  async function handleRebuild() {
    setLoading(true);
    try {
      const result = await rebuildOrdersAction();
      if (result.success) {
        toast.success(result.message ?? "重建完成");
      } else {
        toast.error(result.error ?? "重建失敗");
        if (result.message) {
          toast.info(result.message);
        }
      }
    } catch {
      toast.error("操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-medium text-text-primary mb-2">重建訂單</h3>
      <p className="text-xs text-text-muted mb-4">
        從 Portaly 拉取所有訂單，重建本地訂單與權益記錄。執行前會自動建立快照。
      </p>
      <Button
        onClick={handleRebuild}
        loading={loading}
        variant="primary"
        size="sm"
      >
        開始重建
      </Button>
    </Card>
  );
}
