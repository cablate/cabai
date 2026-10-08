"use client";

import { useState, useEffect } from "react";
import {
  createUserTokenAction,
  revokeUserTokenAction,
  listUserTokensAction,
} from "./actions";
import type { TokenRow } from "./actions";
import { AgentFirstSuccessGuide } from "@/components/agent/agent-first-success-guide";
import {
  ArrowClockwise,
  Check,
  Copy,
  Key,
  ShieldCheck,
  Trash,
} from "@phosphor-icons/react/dist/ssr";

// ─── Constants ───

const EXPIRY_OPTIONS = [
  { label: "30 天", value: 30 },
  { label: "60 天", value: 60 },
  { label: "90 天", value: 90 },
  { label: "無限期", value: null },
] as const;

// ─── Component ───

export default function AgentTokenPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Create form
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [creating, setCreating] = useState(false);

  // Created-token display (shown once)
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Fetch tokens ───

  useEffect(() => {
    let cancelled = false;
    listUserTokensAction()
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setTokens(result.tokens);
        } else {
          setFetchError(result.error ?? "無法取得權杖列表");
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError("無法取得權杖列表，請稍後再試");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ─── Create token ───

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await createUserTokenAction(
        expiresInDays ?? undefined,
      );
      if (result.success) {
        setCreatedToken(result.fullToken);
        refreshTokens();
      } else {
        alert(result.error ?? "無法產生權杖");
      }
    } catch {
      alert("無法產生權杖，請稍後再試");
    } finally {
      setCreating(false);
    }
  }

  // ─── Refresh token list ───

  async function refreshTokens() {
    setRefreshingTokens(true);
    setFetchError(null);
    try {
      const result = await listUserTokensAction();
      if (result.success) {
        setTokens(result.tokens);
      } else {
        setFetchError(result.error ?? "無法取得權杖列表");
      }
    } catch {
      setFetchError("無法取得權杖列表，請稍後再試");
    } finally {
      setRefreshingTokens(false);
    }
  }

  // ─── Revoke token ───

  async function handleRevoke(tokenId: string) {
    if (
      !confirm(
        "確定要撤銷此權杖嗎？正在使用此權杖的外部 Agent 將會立即失去存取權限。",
      )
    ) {
      return;
    }
    try {
      const result = await revokeUserTokenAction(tokenId);
      if (result.success) {
        refreshTokens();
      } else {
        alert(result.error ?? "無法撤銷權杖");
      }
    } catch {
      alert("無法撤銷權杖，請稍後再試");
    }
  }

  // ─── Copy to clipboard ───

  async function handleCopy() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = createdToken;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ─── Helpers ───

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
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

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  const activeTokens = tokens.filter((token) => !isExpired(token.expiresAt));
  const hasActiveToken = loading
    ? null
    : activeTokens.length > 0 || Boolean(createdToken);
  const hasUsedToken = loading
    ? null
    : activeTokens.some((token) => token.lastUsedAt !== null);

  const createTokenSection = (
    <div id="agent-token-create" className="mb-8 rounded-2xl border border-border-subtle bg-surface shadow-card">
      <div className="flex flex-col gap-1 border-b border-border-subtle px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-text-primary">產生新權杖</h2>
        <p className="text-xs text-text-muted">完整權杖只會顯示一次</p>
      </div>
      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:w-48">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              有效期限
            </label>
            <select
              value={expiresInDays === null ? "none" : String(expiresInDays)}
              onChange={(e) =>
                setExpiresInDays(
                  e.target.value === "none" ? null : Number(e.target.value),
                )
              }
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option
                  key={String(opt.value)}
                  value={opt.value === null ? "none" : String(opt.value)}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text-primary px-5 py-2.5 text-sm font-medium text-text-inverted transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            <ShieldCheck size={16} weight="bold" />
            {creating ? "產生中..." : "產生權杖"}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render ───

  return (
    <>
      <div className="mb-6 md:mb-8">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-text-muted">
            Agent 串接
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
            AI Agent 存取權杖
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            產生可供外部 Agent 使用的個人 API 權杖。每個權杖只能讀取你的課程與內容授權。
          </p>
        </div>
      </div>

      {createdToken && (
        <div className="mb-6 rounded-2xl border border-warning/25 bg-warning-light p-5 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <Key size={17} weight="duotone" className="text-warning" />
            <h2 className="text-sm font-semibold text-text-primary">權杖已產生</h2>
          </div>
          <p className="mb-3 text-xs text-text-secondary">
            此完整權杖僅顯示一次，關閉後將無法再次查看。請立即複製並妥善保存。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs text-text-primary ring-1 ring-border">
              {createdToken}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-text-primary px-4 py-2 text-xs font-medium text-text-inverted transition-all hover:opacity-90 active:scale-[0.98]"
            >
              {copied ? (
                <><Check size={14} weight="bold" /> 已複製</>
              ) : (
                <><Copy size={14} /> 複製</>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedToken(null)}
            className="mt-3 text-xs text-text-muted underline underline-offset-2 transition-colors hover:text-text-primary"
          >
            關閉
          </button>
        </div>
      )}

      {hasActiveToken === false && createTokenSection}

      <div className="mb-6">
        <AgentFirstSuccessGuide
          hasToken={hasActiveToken}
          hasUsedToken={hasUsedToken}
          onRefreshStatus={refreshTokens}
          refreshing={refreshingTokens}
        />
      </div>

      {hasActiveToken !== false && createTokenSection}

      <div>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">現有權杖</h2>
            <p className="mt-1 text-sm text-text-secondary">管理已建立的 Agent 存取入口。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 rounded-xl border border-border-subtle bg-surface p-1 sm:w-auto">
              <TokenMetric label="有效權杖" value={tokens.filter((token) => !isExpired(token.expiresAt)).length} />
              <TokenMetric label="已建立" value={tokens.length} />
            </div>
            <button
              type="button"
              onClick={refreshTokens}
              disabled={refreshingTokens}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-surface-muted hover:text-text-primary active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              <ArrowClockwise size={13} weight="bold" />
              {refreshingTokens ? "重新整理中…" : "重新整理"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-xl bg-surface-muted/70" />
              ))}
            </div>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface px-6 py-16 text-center shadow-card">
            <p className="text-sm text-danger">{fetchError}</p>
            <button
              type="button"
              onClick={refreshTokens}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-muted px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-surface-muted/80 active:scale-[0.98]"
            >
              <ArrowClockwise size={13} weight="bold" />
              重新整理
            </button>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-start justify-center rounded-2xl border border-border-subtle bg-surface p-8 shadow-card">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted">
              <Key size={22} weight="duotone" className="text-text-muted" />
            </div>
            <p className="text-base font-semibold text-text-primary">尚無任何權杖</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-text-secondary">
              產生第一個權杖後，它會顯示在這裡。建議先用 90 天有效期測試串接流程。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-muted/50 text-left text-xs font-medium uppercase text-text-muted">
                  <th className="px-5 py-3">Prefix</th>
                  <th className="px-5 py-3">Scopes</th>
                  <th className="px-5 py-3 hidden sm:table-cell">有效期限</th>
                  <th className="px-5 py-3 hidden md:table-cell">最後使用</th>
                  <th className="px-5 py-3 hidden md:table-cell">建立時間</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {tokens.map((token) => (
                  <tr
                    key={token.id}
                    className="transition-colors hover:bg-surface-muted/30"
                  >
                    <td className="px-5 py-4 font-mono text-xs text-text-primary">
                      {token.tokenPrefix}...
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 text-xs text-text-secondary sm:table-cell">
                      {token.expiresAt ? (
                        <span className={isExpired(token.expiresAt) ? "text-danger" : ""}>
                          {formatDate(token.expiresAt)}
                          {isExpired(token.expiresAt) && " (已過期)"}
                        </span>
                      ) : (
                        <span className="text-text-muted">無限期</span>
                      )}
                    </td>
                    <td className="hidden px-5 py-4 text-xs text-text-secondary md:table-cell">
                      {formatDate(token.lastUsedAt)}
                    </td>
                    <td className="hidden px-5 py-4 text-xs text-text-secondary md:table-cell">
                      {formatDate(token.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevoke(token.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-danger-light hover:text-danger active:scale-[0.98]"
                      >
                        <Trash size={12} />
                        <span className="hidden sm:inline">撤銷</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-border-subtle sm:hidden">
              {tokens.map((token) => (
                <div key={token.id} className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-medium text-text-primary">
                        {token.tokenPrefix}...
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        建立於 {formatDate(token.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(token.id)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-danger-light hover:text-danger active:scale-[0.98]"
                    >
                      <Trash size={13} />
                      撤銷
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {token.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <TokenMeta
                      label="有效期限"
                      value={token.expiresAt ? (isExpired(token.expiresAt) ? "已過期" : formatDate(token.expiresAt)) : "無限期"}
                      danger={Boolean(token.expiresAt && isExpired(token.expiresAt))}
                    />
                    <TokenMeta label="最後使用" value={formatDate(token.lastUsedAt)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TokenMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-h-9 min-w-20 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

function TokenMeta({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className={`mt-0.5 font-medium ${danger ? "text-danger" : "text-text-secondary"}`}>
        {value}
      </p>
    </div>
  );
}
