"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { PublicSkillDistribution } from "@/lib/services/skill-release-service";

type DownloadState =
  | { kind: "available"; href: string }
  | { kind: "login-required"; href: string }
  | { kind: "unavailable" };

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

export function SkillQuickActions({
  distribution,
  installPrompt,
  agentPrompt,
  download,
}: {
  distribution: PublicSkillDistribution;
  installPrompt?: string;
  agentPrompt: string;
  download: DownloadState;
}) {
  const [copied, setCopied] = useState<"install" | "agent" | null>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);

  async function handleCopy(kind: "install" | "agent", value: string) {
    try {
      await copyText(value);
      setCopied(kind);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  const github = distribution.mode === "github" ? distribution : null;

  return (
    <aside className="rounded-xl border border-border-subtle bg-surface-muted p-5 shadow-card sm:p-6" aria-labelledby="skill-actions-heading">
      <p className="text-xs font-semibold tracking-[0.14em] text-text-muted">開始使用</p>
      <h2 id="skill-actions-heading" className="mt-2 text-lg font-semibold tracking-tight text-text-primary">選擇適合你的入口</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {github
          ? "先在 CabAI 了解用途，再直接前往 GitHub 查看與安裝完整 Skill。"
          : "人可以從完整說明開始；AI 則可直接從 Agent API 取得可用內容。"}
      </p>

      <div className="mt-5 grid gap-2.5">
        {github && installPrompt ? (
          <Button type="button" size="md" className="w-full" onClick={() => handleCopy("install", installPrompt)} aria-live="polite">
            {copied === "install" ? <Check size={17} data-icon="inline-start" aria-hidden="true" /> : <Copy size={17} data-icon="inline-start" aria-hidden="true" />}
            {copied === "install" ? "安裝指令已複製" : "複製給 AI 安裝"}
          </Button>
        ) : null}

        {github ? (
          <Button asChild variant="secondary" size="md" className="w-full">
            <a href={github.repositoryUrl} target="_blank" rel="noopener noreferrer">
              在 GitHub 查看完整內容
              <ArrowUpRight size={17} data-icon="inline-end" aria-hidden="true" />
            </a>
          </Button>
        ) : null}

        {!github && download.kind === "available" ? (
          <Button asChild size="md" className="w-full">
            <a href={download.href}>
              <DownloadSimple size={17} data-icon="inline-start" aria-hidden="true" />
              下載 Skill 檔案
            </a>
          </Button>
        ) : null}

        {!github && download.kind === "login-required" ? (
          <Button asChild variant="secondary" size="md" className="w-full">
            <Link prefetch={false} href={download.href}>
              <DownloadSimple size={17} data-icon="inline-start" aria-hidden="true" />
              登入後下載
            </Link>
          </Button>
        ) : null}

        <Button type="button" variant="secondary" size="md" onClick={() => handleCopy("agent", agentPrompt)} className="w-full" aria-live="polite">
          {copied === "agent" ? <Check size={17} data-icon="inline-start" aria-hidden="true" /> : <Copy size={17} data-icon="inline-start" aria-hidden="true" />}
          {copied === "agent" ? "Agent API 查詢已複製" : "複製 Agent API 查詢"}
        </Button>
      </div>

      {!github && download.kind === "login-required" ? (
        <p className="mt-4 text-xs leading-5 text-text-muted">需要登入才能下載；登入後會依帳號權限重新確認資格。</p>
      ) : null}
      {!github && download.kind === "unavailable" ? (
        <p className="mt-4 text-xs leading-5 text-text-muted">目前帳號尚未符合這個版本的下載條件。</p>
      ) : null}
      <p className="mt-4 border-t border-border-subtle pt-4 text-xs leading-5 text-text-muted">
          {github
            ? "CabAI 提供繁體中文介紹與 Agent API 索引；完整內容、安裝與更新都以 GitHub Repository 為準。"
            : "複製入口後，請讓 AI 依 Agent API 的權限與回應內容取得資訊。"}
      </p>
    </aside>
  );
}
