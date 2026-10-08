"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  BookOpenText,
  Check,
  Copy,
  Key,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { USER_AGENT_PROMPT } from "@/lib/agent/prompt-copy";

interface AgentFirstSuccessGuideProps {
  hasToken: boolean | null;
  hasUsedToken: boolean | null;
  onCreateToken?: () => void;
  onRefreshStatus?: () => void;
  refreshing?: boolean;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await copyText(value);
      setCopied(true);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border-subtle bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-text-muted">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          aria-label={`${label}：複製`}
          className="-my-1 shrink-0"
        >
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            {copied ? (
              <Check size={14} weight="bold" data-icon="inline-start" />
            ) : (
              <Copy size={14} data-icon="inline-start" />
            )}
            {copied ? "已複製" : "複製"}
          </span>
        </Button>
      </div>
      <details className="mt-2 border-t border-border-subtle pt-2">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary">
          查看完整指令
        </summary>
        <code className="mt-2 block max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted/60 p-3 font-mono text-[11px] leading-5 text-text-secondary">
          {value}
        </code>
      </details>
    </div>
  );
}

function getTokenStatusCopy(hasToken: boolean | null): string {
  if (hasToken === null) return "正在確認目前是否已有有效權杖。";
  if (hasToken) return "已找到可用權杖，可以進入下一步。";
  return "先建立權杖；完整內容只會顯示一次，請立即保存。";
}

export function AgentFirstSuccessGuide({
  hasToken,
  hasUsedToken,
  onCreateToken,
  onRefreshStatus,
  refreshing = false,
}: AgentFirstSuccessGuideProps) {
  return (
    <Card surface="default" className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
          <BookOpenText size={20} weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">第一次成功：先讓 AI 讀到一筆資料</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            建立權杖後，只要複製一次指令；AI 會依 User OpenAPI 完成第一個受保護讀取。
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-5">
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-secondary">1</span>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Key size={16} weight="duotone" aria-hidden="true" />
              建立 User Agent 權杖
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {getTokenStatusCopy(hasToken)}
            </p>
            {hasToken === false && onCreateToken && (
              <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onCreateToken}>
                前往建立權杖
                <ArrowRight data-icon="inline-end" size={14} weight="bold" aria-hidden="true" />
              </Button>
            )}
          </div>
        </li>

        {hasToken && (
          <>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-secondary">2</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-text-primary">把一段完整指令交給 AI</h3>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  指令已包含 OpenAPI、第一個 GET、ACK 條件與權限界線；Token 仍只放在你的安全環境變數。
                </p>
                <CopyRow label="給 AI 的串接指令" value={USER_AGENT_PROMPT} />
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-secondary">3</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-text-primary">確認 CabAI 已收到有效請求</h3>
                {hasUsedToken ? (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-success-light px-3 py-1.5 text-xs font-medium text-success">
                    <Check size={14} weight="bold" aria-hidden="true" />
                    已偵測到有效 API 使用
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                      AI 回報 200 後重新確認。空公告清單也代表授權與第一個 endpoint 串接成功。
                    </p>
                    {onRefreshStatus && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={onRefreshStatus}
                        disabled={refreshing}
                      >
                        <ArrowClockwise size={14} weight="bold" aria-hidden="true" />
                        {refreshing ? "確認中…" : "重新確認使用狀態"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          </>
        )}
      </ol>

      {hasToken && (
        <div className="mt-5 grid gap-2 rounded-lg border border-border-subtle bg-surface-muted/60 p-3 text-[11px] leading-relaxed text-text-secondary sm:grid-cols-3">
          <span><strong className="font-semibold text-text-primary">200</strong>：授權與請求成功</span>
          <span><strong className="font-semibold text-text-primary">401／403</strong>：檢查 token 或 scope</span>
          <span><strong className="font-semibold text-text-primary">404</strong>：檢查實際資源識別值</span>
        </div>
      )}
    </Card>
  );
}
