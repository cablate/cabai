"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { publishLibraryAction, withdrawLibraryAction } from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
  entryId: string;
  title: string;
  revision: number;
  status: "draft" | "published" | "withdrawn";
  canPublish: boolean;
  publishBlockers: string[];
  informationId?: string;
  informationRevision?: number;
  idempotencyKey: string;
}

export function LibraryLifecycleActions(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function publish() {
    const confirmed = await confirm({
      title: "確認發佈 Library 與 Information",
      description: `「${props.title}」會連同目前的 Information 草稿一起原子發佈。`,
      confirmLabel: "確認發佈",
      cancelLabel: "取消",
      variant: "primary",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("confirmed", "yes");
      formData.set("libraryId", props.entryId);
      formData.set("expectedLibraryRevision", String(props.revision));
      formData.set("informationId", props.informationId ?? "");
      formData.set("expectedInformationRevision", String(props.informationRevision ?? ""));
      formData.set("idempotencyKey", props.idempotencyKey);
      const result = await publishLibraryAction(formData);
      if (!result.success) {
        toast.error(result.error ?? "發佈失敗。");
        return;
      }
      toast.success("Library 與 Information 已發佈。");
      router.refresh();
    });
  }

  async function withdraw() {
    const confirmed = await confirm({
      title: "確認下架 Library",
      description: `「${props.title}」下架後將不再公開顯示。此 canonical 操作不會自動下架 Information。`,
      confirmLabel: "確認下架",
      cancelLabel: "取消",
      variant: "danger",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("confirmed", "yes");
      formData.set("libraryId", props.entryId);
      formData.set("expectedLibraryRevision", String(props.revision));
      const result = await withdrawLibraryAction(formData);
      if (!result.success) {
        toast.error(result.error ?? "下架失敗。");
        return;
      }
      toast.success("Library 已下架。");
      router.refresh();
    });
  }

  if (props.status === "withdrawn") {
    return <p className="text-sm text-text-muted">此項目已下架，canonical lifecycle 沒有後續可用動作。</p>;
  }

  return (
    <div className="space-y-3">
      {props.status === "draft" && (
        <>
          <Button type="button" loading={pending} disabled={!props.canPublish} onClick={publish}>
            發佈 Library 與 Information
          </Button>
          {!props.canPublish && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-danger">
              {props.publishBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </>
      )}
      {props.status === "published" && (
        <Button type="button" variant="danger" loading={pending} onClick={withdraw}>下架 Library</Button>
      )}
    </div>
  );
}
