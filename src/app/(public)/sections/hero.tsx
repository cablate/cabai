"use client";

import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import { BRAND_NAME } from "@/lib/constants";


import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Database,
  Robot,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

export const demoScenarios = [
  {
    id: "course",
    label: "已購課程",
    question: "依照我買過的 Agent API 課程，下一步該做什麼？",
    endpoint: "GET /api/agent/courses/{id}/content",
    source: "你的已授權課程",
    answer: "課程內容會依 course id 與帳號授權提供。先設定 User Agent，再用已授權的 course id 讀取。",
  },
  {
    id: "skill",
    label: "工作 Skill",
    question: "幫我把這次功能需求整理成可以執行的計畫。",
    endpoint: "GET /api/agent/public/v1/skills/planseal",
    source: "Planseal Skill",
    answer: "我會先建立可驗收的變更契約，再拆分工作與依賴，最後安排 focused tests 和完整驗證。",
  },
  {
    id: "library",
    label: "公開資源",
    question: "Windows 版 Codex 最近很卡，先幫我確認原因。",
    endpoint: "GET /api/agent/public/v1/library/windows-codex-lag-troubleshooting-20260718",
    source: "Library 排查指南",
    answer: "先對照 log 的 serialport 與 DLL 錯誤；只有時間和症狀相符，再採用文件中的暫時處理方式。",
  },
] as const;

const phaseTransition = {
  duration: 0.42,
  ease: [0.32, 0.72, 0, 1] as const,
};

const retrievalDelayMs = 760;
const answerDelayMs = 1720;
const completedHoldMs = 2000;
const scenarioDurationMs = answerDelayMs + completedHoldMs;

export function HeroSection() {
  return (
    <section
      className="relative isolate -mt-[var(--site-header-height)] min-h-[min(100dvh,52rem)] overflow-hidden border-b border-border-subtle bg-surface pt-[calc(var(--site-header-height)+1.25rem)]"
    >
      <div data-hero-atlas className="absolute -inset-3 -z-30" aria-hidden="true">
        <Image
          src={PUBLIC_BRANDING.illustration}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[66%_center]"
        />
      </div>
      <div
        className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(251,252,251,0.99)_0%,rgba(251,252,251,0.96)_42%,rgba(251,252,251,0.74)_72%,rgba(251,252,251,0.48)_100%)]"
        aria-hidden="true"
      />
      <div className="home-grid absolute inset-0 -z-10 opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-[calc(min(100dvh,52rem)-var(--site-header-height)-1.25rem)] max-w-[84rem] items-center gap-9 px-5 pb-10 pt-3 sm:px-8 sm:pb-12 xl:grid-cols-[minmax(0,0.84fr)_minmax(27rem,1.16fr)] xl:gap-10 xl:px-12">
        <div className="relative z-10 max-w-xl xl:max-w-none">
          <div className="flex items-center gap-3 text-sm font-semibold text-accent">
            <span className="flex size-8 items-center justify-center rounded-full border border-accent/20 bg-surface/80 shadow-card backdrop-blur-sm">
              <Sparkle size={15} weight="fill" aria-hidden="true" />
            </span>
            <span>{BRAND_NAME} Knowledge Hub</span>
            <span className="h-px w-12 bg-accent/35" aria-hidden="true" />
          </div>

          <h1
            className="mt-6 max-w-[10ch] font-display text-[clamp(2.65rem,11vw,4rem)] font-medium leading-[1.02] tracking-[-0.045em] text-text-primary xl:max-w-[9.5ch] xl:text-[clamp(4rem,5vw,4.75rem)]"
          >
            你學會的內容
            <span className="mt-1 block text-accent">讓 AI 接著用</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-7 text-text-secondary xl:text-lg xl:leading-8">
            課程和資源留在 {BRAND_NAME}。你負責學習與決定，AI 依權限取得內容並協助工作。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="sm:min-w-44">
              <Link prefetch={false} href="/products">
                看看有哪些內容
                <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="sm:min-w-44">
              <Link prefetch={false} href="/dashboard/settings/agent">
                設定 Agent API
                <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div
          data-hero-demo
          className="relative z-10 min-w-0 w-full xl:justify-self-end"
        >
          <KnowledgeConversationDemo />
        </div>
      </div>
    </section>
  );
}

function KnowledgeConversationDemo() {
  const reduceMotion = useHydratedReducedMotion();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [phase, setPhase] = useState(0);
  const [restartCycle, setRestartCycle] = useState(0);
  const scenario = demoScenarios[scenarioIndex]!;
  const visiblePhase = reduceMotion ? 2 : phase;

  useEffect(() => {
    if (reduceMotion) return;

    const retrievalTimer = window.setTimeout(() => setPhase(1), retrievalDelayMs);
    const answerTimer = window.setTimeout(() => setPhase(2), answerDelayMs);
    const nextTimer = window.setTimeout(() => {
      setPhase(0);
      setScenarioIndex((current) => (current + 1) % demoScenarios.length);
    }, scenarioDurationMs);

    return () => {
      window.clearTimeout(retrievalTimer);
      window.clearTimeout(answerTimer);
      window.clearTimeout(nextTimer);
    };
  }, [reduceMotion, restartCycle, scenarioIndex]);

  function selectScenario(index: number) {
    setScenarioIndex(index);
    setPhase(reduceMotion ? 2 : 0);
    setRestartCycle((current) => current + 1);
  }

  return (
    <div className="relative mx-auto w-full max-w-[44rem]" aria-label={`${BRAND_NAME} Agent API 使用示範`}>
      <motion.div
        className="relative w-full min-w-0 overflow-hidden rounded-[1.35rem] border border-border-inverted bg-ink text-text-inverted shadow-[0_32px_76px_-34px_rgba(8,31,24,0.58)]"
        transition={phaseTransition}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-inverted px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated/10 text-amber-soft">
              <Robot size={19} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-inverted">你的 AI · {BRAND_NAME}</p>
              <p className="truncate text-xs text-text-inverted/52">已連接 Agent API</p>
            </div>
          </div>
          <Badge variant="success" className="shrink-0">
            已連線
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-1 border-b border-border-inverted bg-surface-elevated/[0.025] p-2" aria-label="切換使用情境">
          {demoScenarios.map((item, index) => {
            const active = index === scenarioIndex;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectScenario(index)}
                className={cn(
                  "relative min-h-11 min-w-0 rounded-lg px-2 py-2 text-[0.68rem] font-medium transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-soft active:scale-[0.98] sm:px-3 sm:text-xs",
                  active ? "text-ink" : "text-text-inverted/58 hover:bg-surface-elevated/[0.05] hover:text-text-inverted",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="active-knowledge-demo"
                    className="absolute inset-0 rounded-lg bg-amber-soft"
                    transition={reduceMotion ? { duration: 0 } : phaseTransition}
                  />
                )}
                <span className="relative block truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="h-[22rem] w-full min-w-0 overflow-hidden p-4 sm:h-[22rem] sm:p-5" aria-live="off">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${scenario.id}-${restartCycle}`}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={phaseTransition}
              className="flex flex-col gap-4"
            >
              <div className="flex justify-end gap-2.5">
                <div className="max-w-[84%] rounded-2xl rounded-br-md bg-surface-elevated px-3.5 py-2.5 text-sm leading-6 text-ink">
                  {scenario.question}
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated/10 text-text-inverted/70">
                  <UserCircle size={19} weight="duotone" aria-hidden="true" />
                </span>
              </div>

              <div className="flex gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-text-inverted">
                  <Robot size={18} weight="duotone" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <AnimatePresence initial={false}>
                    {visiblePhase === 0 && (
                      <motion.div
                        key="thinking"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 py-2 text-sm text-text-inverted/58"
                      >
                        <span>正在確認可用資料</span>
                        <span className="inline-flex gap-1" aria-hidden="true">
                          {[0, 1, 2].map((dot) => (
                            <motion.span
                              key={dot}
                              className="size-1 rounded-full bg-surface-elevated/45"
                              animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
                              transition={{ duration: 1, repeat: Infinity, delay: dot * 0.16 }}
                            />
                          ))}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {visiblePhase >= 1 && (
                      <motion.div
                        key="retrieval"
                        layout
                        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={phaseTransition}
                        className="rounded-xl border border-border-inverted bg-surface-elevated/[0.06] p-3.5"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium text-amber-soft">
                          <Database size={16} weight="duotone" aria-hidden="true" />
                          從 {BRAND_NAME} 取得內容
                        </div>
                        <code className="mt-2.5 block break-all whitespace-pre-wrap font-mono text-[0.64rem] leading-4 text-text-inverted/58 sm:text-[0.7rem] sm:leading-5">
                          {scenario.endpoint}
                        </code>
                        <div className="mt-2.5 flex items-center gap-2 text-xs text-text-inverted/68">
                          <CheckCircle size={16} weight="fill" className="shrink-0 text-success" aria-hidden="true" />
                          <span>{scenario.source}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {visiblePhase >= 2 && (
                      <motion.div
                        key="answer"
                        layout
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...phaseTransition, delay: reduceMotion ? 0 : 0.06 }}
                        className="mt-3 rounded-2xl rounded-tl-md bg-surface-elevated/10 px-3.5 py-2.5 text-sm leading-6 text-text-inverted/82"
                      >
                        {scenario.answer}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
