"use client";

import { useState } from "react";
import { toggleServiceConfig, deleteServiceConfig, regenerateApiKey } from "./actions";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface Config {
  id: string;
  serviceName: string;
  planName: string;
  webhookUrl: string;
  isActive: boolean | null;
  apiKeyPrefix: string;
}

export function ServiceConfigRow({ config }: { config: Config }) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const confirm = useConfirm();

  async function handleRegenerate() {
    const ok = await confirm({
      title: "重新生成 API Key",
      description: "舊 key 將立即失效，確定要重新生成嗎？",
      confirmLabel: "重新生成",
      variant: "danger",
    });
    if (!ok) return;

    const result = await regenerateApiKey(config.id);
    if (result.apiKey) {
      setNewKey(result.apiKey);
      toast.success("API Key 已重新生成");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "刪除服務",
      description: `確定要刪除「${config.serviceName}」嗎？此操作無法復原。`,
      confirmLabel: "刪除",
      variant: "danger",
    });
    if (!ok) return;

    await deleteServiceConfig(config.id);
    toast.success("服務已刪除");
  }

  return (
    <>
      <tr className="transition-colors hover:bg-surface-muted">
        <td className="px-6 py-4 font-medium text-text-primary">{config.serviceName}</td>
        <td className="px-6 py-4 text-text-secondary">{config.planName}</td>
        <td className="px-6 py-4 text-xs font-mono text-text-muted max-w-[200px] truncate">
          {config.webhookUrl}
        </td>
        <td className="px-6 py-4">
          <Badge variant={config.isActive ? "success" : "default"}>
            {config.isActive ? "啟用" : "停用"}
          </Badge>
        </td>
        <td className="px-6 py-4">
          <div className="flex gap-2">
            <button
              onClick={() => toggleServiceConfig(config.id)}
              className="text-xs text-warning hover:underline"
            >
              {config.isActive ? "停用" : "啟用"}
            </button>
            <button
              onClick={handleRegenerate}
              className="text-xs text-info hover:underline"
            >
              重新生成 Key
            </button>
            <button
              onClick={handleDelete}
              className="text-xs text-danger hover:underline"
            >
              刪除
            </button>
          </div>
        </td>
      </tr>
      {newKey && (
        <tr>
          <td colSpan={5} className="px-6 py-3 bg-warning-light">
            <p className="text-sm font-medium text-warning">
              新 API Key（僅顯示一次）：
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-text-primary">
              {newKey}
            </code>
          </td>
        </tr>
      )}
    </>
  );
}
