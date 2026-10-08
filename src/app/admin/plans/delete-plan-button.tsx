"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePlan } from "@/actions/plans";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DeletePlanButton({
  planId,
  planName,
}: {
  planId: string;
  planName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm(`確定要刪除「${planName}」嗎？有訂單的方案會被封存而非刪除。`)) return;

    startTransition(async () => {
      const result = await deletePlan(planId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.deleted) {
        toast.success("方案已刪除");
        router.push("/admin/plans");
      } else if (result.archived) {
        toast.success("此方案有訂單紀錄，已封存（設為未上架）");
      }
    });
  }

  return (
    <Button variant="danger" size="sm" onClick={handleDelete} loading={isPending}>
      刪除方案
    </Button>
  );
}
