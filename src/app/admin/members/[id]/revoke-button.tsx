"use client";

import { useActionState } from "react";
import { revokeAccess, type RevokeAccessResult } from "@/actions/members";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function RevokeButton({
  purchaseId,
  userId,
  planName,
}: {
  purchaseId: string;
  userId: string;
  planName: string;
}) {
  const confirm = useConfirm();
  const [state, formAction, pending] = useActionState<RevokeAccessResult, FormData>(
    revokeAccess,
    null,
  );

  async function handleClick() {
    const ok = await confirm({
      title: "撤銷授權",
      description: `確定要撤銷此會員的「${planName}」存取權限嗎？此操作會立即生效。`,
      confirmLabel: "撤銷",
      cancelLabel: "取消",
    });
    if (!ok) return;

    const fd = new FormData();
    fd.append("purchaseId", purchaseId);
    fd.append("userId", userId);
    formAction(fd);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
      >
        {pending ? "處理中..." : "撤銷"}
      </button>
      {state?.error && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </>
  );
}
