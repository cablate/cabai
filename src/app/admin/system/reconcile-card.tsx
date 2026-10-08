"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { reconcileAction } from "./actions";
import { toast } from "sonner";

export function ReconcileCard() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleReconcile() {
    setLoading(true);
    try {
      const result = await reconcileAction();
      if (result.success) {
        toast.success(result.message ?? "對帳完成");
      } else {
        toast.error(result.error ?? "對帳失敗");
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
      <Card className="p-5 border-yellow-200 bg-yellow-50">
        <h3 className="font-medium text-yellow-900 mb-2">確認對帳?</h3>
        <p className="text-xs text-yellow-800 mb-4">
          此操作將檢查所有訂閱狀態。請確保 Portaly 連接正常。
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleReconcile}
            loading={loading}
            variant="primary"
            size="sm"
          >
            確認
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
      <h3 className="font-medium text-text-primary mb-2">對帳訂閱</h3>
      <p className="text-xs text-text-muted mb-4">
        檢查本地與 Portaly 訂閱狀態
      </p>
      <Button
        onClick={() => setShowConfirm(true)}
        variant="primary"
        size="sm"
      >
        開始對帳
      </Button>
    </Card>
  );
}
