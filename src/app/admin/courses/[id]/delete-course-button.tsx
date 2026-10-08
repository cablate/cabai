"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCourse } from "../actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function DeleteCourseButton({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const confirmed = await confirm({
      title: "刪除課程",
      description: `確定要刪除「${courseTitle}」嗎？課程、章節與課堂會被移到可還原狀態。`,
      confirmLabel: "刪除",
      cancelLabel: "取消",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteCourse(courseId);
      if (!result.success) {
        toast.error(result.error ?? "刪除課程失敗，請稍後再試。");
        return;
      }

      toast.success("課程已刪除");
      router.push("/admin/courses");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={isPending}
      onClick={handleDelete}
    >
      刪除
    </Button>
  );
}
