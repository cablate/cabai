"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";
import { toast } from "sonner";
import { AGENT_PERMISSION_OPTIONS, type AgentPermission } from "@/lib/agent-permissions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AgentPromptCopyBlock } from "@/components/agent/agent-prompt-copy-block";
import { ADMIN_AGENT_PROMPT } from "@/lib/agent/prompt-copy";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// Single source of truth — driven by AGENT_PERMISSION_OPTIONS so adding a
// permission in agent-auth.ts automatically surfaces here without a UI edit.
const PERMISSION_OPTIONS = AGENT_PERMISSION_OPTIONS;

const EXPIRY_OPTIONS = [
  { label: "90 days", value: 90 },
  { label: "30 days", value: 30 },
  { label: "180 days", value: 180 },
  { label: "1 year", value: 365 },
  { label: "No expiry", value: null },
];

const apiKeyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  permissions: z.array(z.custom<AgentPermission>()).min(1, "Choose at least one scope"),
  expiresInDays: z.string(),
});

type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>;

export function ApiKeyManager({ keys }: { keys: ApiKeyRow[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      name: "",
      permissions: ["content:read"],
      expiresInDays: "90",
    },
  });

  async function handleCreate(values: ApiKeyFormValues) {
    try {
      const result = await createApiKeyAction({
        name: values.name,
        permissions: values.permissions,
        expiresInDays: values.expiresInDays === "none" ? null : Number(values.expiresInDays),
      });
      if (result.success && result.fullKey) {
        setCreatedKey(result.fullKey);
        reset();
        toast.success("API key created");
      } else {
        toast.error(result.error ?? "Failed to create API key");
      }
    } catch {
      toast.error("Failed to create API key");
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm("Revoke this API key? Existing agents using it will stop working.")) return;
    const result = await revokeApiKeyAction(keyId);
    if (result.success) {
      toast.success("API key revoked");
    } else {
      toast.error(result.error ?? "Failed to revoke API key");
    }
  }

  async function handleCopy() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "-";
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    }).format(new Date(iso));
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-8">
      <AgentPromptCopyBlock
        title="給 Admin Agent 的設定提示詞"
        description="複製後交給你的管理型 AI；實際 Admin token 請以安全環境變數提供，不要貼進提示詞。"
        prompt={ADMIN_AGENT_PROMPT}
      />

      {createdKey && (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <h3 className="mb-2 font-medium text-amber-900">API key created</h3>
          <p className="mb-3 text-xs text-amber-800">
            This full key is shown once. Store it before closing this panel.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded bg-white px-3 py-2 font-mono text-xs text-amber-900 break-all ring-1 ring-amber-200">
              {createdKey}
            </code>
            <Button size="sm" variant="primary" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => { setCreatedKey(null); setShowCreate(false); }}
            className="mt-3 text-xs text-amber-700 underline"
          >
            Done
          </button>
        </Card>
      )}

      {!createdKey && (
        <>
          {showCreate ? (
            <Card className="space-y-5 p-5">
              <form onSubmit={handleSubmit(handleCreate)} className="space-y-5" noValidate>
              <div>
                <h3 className="font-medium text-text-primary">Create API key</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Choose only the scopes this agent needs.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <Input
                    label="Name"
                    type="text"
                    placeholder="content-agent"
                    error={errors.name?.message}
                    {...register("name")}
                />
                <Select label="Expires" {...register("expiresInDays")}>
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value ?? "none"}>
                        {option.label}
                      </option>
                    ))}
                </Select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PERMISSION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm"
                    title={option.description}
                  >
                    <input
                      type="checkbox"
                      value={option.value}
                      {...register("permissions")}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-text-muted">{option.value}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.permissions && <p className="text-xs text-danger">{errors.permissions.message}</p>}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={isSubmitting} variant="primary" size="sm">
                  Create
                </Button>
                <Button type="button" onClick={() => { reset(); setShowCreate(false); }} variant="secondary" size="sm">
                  Cancel
                </Button>
              </div>
              </form>
            </Card>
          ) : (
            <Button onClick={() => setShowCreate(true)} variant="primary" size="sm">
              Create API key
            </Button>
          )}
        </>
      )}

      {activeKeys.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-hover text-left text-xs font-medium uppercase text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {activeKeys.map((key) => (
                <tr key={key.id} className="hover:bg-surface-hover/50">
                  <td className="px-4 py-3 font-medium text-text-primary">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{key.keyPrefix}...</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    <div className="flex max-w-md flex-wrap gap-1">
                      {key.permissions.map((permission) => (
                        <span key={permission} className="rounded bg-surface-muted px-2 py-0.5">
                          {permission}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatDate(key.expiresAt)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatDate(key.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(key.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-text-muted">No active API keys</p>
        </Card>
      )}

      {revokedKeys.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-text-muted">Revoked keys</h3>
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white opacity-60">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border-subtle">
                {revokedKeys.map((key) => (
                  <tr key={key.id}>
                    <td className="px-4 py-2 text-text-muted line-through">{key.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-text-muted">{key.keyPrefix}...</td>
                    <td className="px-4 py-2 text-xs text-text-muted">Revoked {formatDate(key.revokedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
