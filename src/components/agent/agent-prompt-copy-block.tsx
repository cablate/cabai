"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AgentPromptCopyBlockProps {
  title: string;
  description: string;
  prompt: string;
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

export function AgentPromptCopyBlock({
  title,
  description,
  prompt,
}: AgentPromptCopyBlockProps) {
  const [copied, setCopied] = useState(false);
  const resetCopiedTimerRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      if (resetCopiedTimerRef.current !== null) {
        window.clearTimeout(resetCopiedTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await copyText(prompt);
      setCopied(true);
      if (resetCopiedTimerRef.current !== null) {
        window.clearTimeout(resetCopiedTimerRef.current);
      }
      resetCopiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card surface="muted" className="p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-secondary">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          aria-label={`${title}：複製提示詞`}
          className="shrink-0 self-start"
        >
          <span className="grid min-w-[5.25rem] place-items-center">
            <AnimatePresence initial={false} mode="sync">
              <motion.span
                key={copied ? "copied" : "idle"}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
                className="inline-flex items-center gap-1.5"
              >
                {copied ? <Check size={14} weight="bold" data-icon="inline-start" /> : <Copy size={14} data-icon="inline-start" />}
                {copied ? "已複製" : "複製提示詞"}
              </motion.span>
            </AnimatePresence>
          </span>
        </Button>
      </div>
      <pre className="mt-4 max-h-80 overflow-auto rounded-lg border border-border-subtle bg-surface px-4 py-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap"><code>{prompt}</code></pre>
      <p className="mt-3 text-[11px] text-text-muted" aria-live="polite">
        提示詞不包含任何 API 金鑰；請把實際 token 放在你使用的 AI 工具之安全環境變數中。
      </p>
    </Card>
  );
}
