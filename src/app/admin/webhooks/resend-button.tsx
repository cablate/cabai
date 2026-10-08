"use client";

import { resendWebhook, retryEntitlementTransition } from "./actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

export function ResendButton({
  logId,
  kind,
}: {
  logId: string;
  kind: "webhook" | "entitlement";
}) {
  const confirm = useConfirm();

  async function handleResend() {
    const ok = await confirm({
      title: kind === "webhook" ? "重新發送 Webhook" : "重試權限同步",
      description: kind === "webhook"
        ? "確定要重新發送此 webhook 嗎？"
        : "確定要重試尚未完成的權限／Discord 同步嗎？已完成的步驟不會重複。",
      confirmLabel: "重送",
      variant: "primary",
    });
    if (!ok) return;

    if (kind === "webhook") await resendWebhook(logId);
    else await retryEntitlementTransition(logId);
    toast.success("已排入重送佇列");
  }

  return (
    <button
      onClick={handleResend}
      className="text-xs font-medium text-info hover:underline"
    >
      重送
    </button>
  );
}
