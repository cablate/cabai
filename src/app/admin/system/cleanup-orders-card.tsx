"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cleanupOrdersAction } from "./actions";
import { toast } from "sonner";

export function CleanupOrdersCard() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleCleanup() {
    setLoading(true);
    try {
      const result = await cleanupOrdersAction();
      if (result.success) {
        toast.success(result.message ?? "清理完成");
      } else {
        toast.error(result.error ?? "清理失敗");
      }
      setShowConfirm(false);
    } catch {
      toast.error("操作失敗");
    } finally {
      setLoading(false);
    }
  }

  if (showConfirm) {
    return (
      <Card className="p-5 border-orange-200 bg-orange-50">
        <h3 className="font-medium text-orange-900 mb-2">確認清理?</h3>
        <p className="text-xs text-orange-800 mb-4">
          此操作將標記超過 24 小時的待處理訂單為已過期。此操作無法復原。
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleCleanup}
            loading={loading}
            variant="danger"
            size="sm"
          >
            確認清理
          </Button>
          <Button
            onClick={() => setShowConfirm(false)}
            disabled={loading}
            variant="secondary"
            size="sm"
          >
            取消
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-medium text-text-primary mb-2">清理訂單</h3>
      <p className="text-xs text-text-muted mb-4">
        標記超過 24 小時的待處理訂單為已過期
      </p>
      <Button
        onClick={() => setShowConfirm(true)}
        variant="primary"
        size="sm"
      >
        清理訂單
      </Button>
    </Card>
  );
}
