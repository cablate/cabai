"use client";

import { PUBLIC_BRANDING } from "@/lib/config/public-branding";


import { useLayoutEffect, useRef } from "react";
import {
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  CheckCircle,
  Database,
  IdentificationCard,
  Key,
  Robot,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";
import { HomeSectionBackdrop } from "./home-section-backdrop";

const stages = [
  {
    icon: Database,
    shortTitle: "內容分工",
    title: "先把每種內容放在對的位置",
    body: "公告告訴你發生了什麼；Library 保存完整資料；Skill 是 AI 能採用的做法；課程則建立完整能力。",
  },
  {
    icon: IdentificationCard,
    shortTitle: "帳號權限",
    title: "權限跟著帳號，不跟著 Key",
    body: "Agent API Key 只是可替換的存取憑證。換 Key 或撤銷 Key，都不會改變你已取得的課程與內容。",
  },
  {
    icon: Robot,
    shortTitle: "AI 使用",
    title: "需要時，AI 直接回到來源",
    body: "AI 依照你的權限取得內容，回答時可以摘要、引用，也能採用 Skill 完成工作。",
  },
] as const;

const sourceItems = [
  { icon: BookOpenText, title: "課程", description: "完整學習路徑與已購章節" },
  { icon: Database, title: "Library", description: "公開指南與長篇參考資料" },
  { icon: BracketsCurly, title: "Skill", description: "AI 可以直接採用的工作方法" },
  { icon: Sparkle, title: "Information", description: "最新變化與下一個查詢方向" },
] as const;

export function KnowledgeJourneySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useHydratedReducedMotion();

  useLayoutEffect(() => {
    if (reduceMotion || !sectionRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add("(min-width: 1280px)", () => {
      const context = gsap.context(() => {
        const stage = sectionRef.current?.querySelector<HTMLElement>("[data-journey-stage]");
        const copies = gsap.utils.toArray<HTMLElement>("[data-journey-copy]");
        const visuals = gsap.utils.toArray<HTMLElement>("[data-journey-visual]");
        const indicators = gsap.utils.toArray<HTMLElement>("[data-journey-indicator]");
        if (!stage || copies.length < 3 || visuals.length < 3 || indicators.length < 3) return;

        gsap.set([...copies.slice(1), ...visuals.slice(1)], { autoAlpha: 0, y: 28 });
        gsap.set(indicators, { opacity: 0.34 });
        gsap.set(indicators[0]!, { opacity: 1 });

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=1400",
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
          },
        });

        for (let index = 1; index < stages.length; index += 1) {
          const position = index === 1 ? 0.4 : 1.25;
          timeline
            .to([copies[index - 1], visuals[index - 1]], {
              autoAlpha: 0,
              y: -24,
              duration: 0.45,
              ease: "power1.inOut",
            }, position)
            .to([copies[index], visuals[index]], {
              autoAlpha: 1,
              y: 0,
              duration: 0.45,
              ease: "power1.inOut",
            }, position)
            .to(indicators[index - 1]!, { opacity: 0.34, duration: 0.3 }, position)
            .to(indicators[index]!, { opacity: 1, duration: 0.3 }, position);
        }
      }, sectionRef);

      return () => context.revert();
    });

    return () => media.revert();
  }, [reduceMotion]);

  return (
    <section
      ref={sectionRef}
      id="knowledge-flow"
      className="relative isolate overflow-hidden border-b border-border-inverted bg-ink text-text-inverted"
    >
      <HomeSectionBackdrop
        src={PUBLIC_BRANDING.illustration}
        imageClassName="object-[72%_center]"
        className="opacity-[0.22] sm:opacity-[0.28]"
        overlayClassName="bg-[linear-gradient(90deg,rgba(8,31,24,0.96)_0%,rgba(8,31,24,0.86)_48%,rgba(8,31,24,0.54)_100%)]"
      />
      <div
        data-journey-stage
        className={cn(
          "mx-auto min-h-[100dvh] max-w-[90rem] grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)] items-center gap-20 px-8 py-20 xl:px-12",
          reduceMotion ? "hidden" : "hidden xl:grid",
        )}
      >
        <div className="flex min-h-[30rem] flex-col justify-center">
          <div className="relative min-h-60">
            {stages.map((stage, index) => (
              <div
                key={stage.title}
                data-journey-copy
                className={cn(
                  "absolute inset-0 flex flex-col justify-center",
                  index > 0 && "invisible",
                )}
              >
                <stage.icon className="mb-6 text-amber-soft" size={28} weight="duotone" aria-hidden="true" />
                <h2 className="max-w-xl font-display text-4xl font-medium leading-[1.06] tracking-[-0.045em] text-text-inverted xl:text-6xl">
                  {stage.title}
                </h2>
                <p className="mt-7 max-w-lg text-lg leading-8 text-text-inverted/62">
                  {stage.body}
                </p>
              </div>
            ))}
          </div>
          <ol className="mt-8 grid grid-cols-3 gap-3 border-t border-border-inverted pt-5" aria-label="知識流程階段">
            {stages.map((stage) => (
              <li key={stage.title} data-journey-indicator className="flex items-center gap-2 text-xs text-text-inverted/72">
                <stage.icon className="shrink-0 text-amber-soft" size={16} weight="duotone" aria-hidden="true" />
                <span className="truncate">{stage.shortTitle}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative min-h-[35rem] overflow-hidden rounded-2xl border border-border-inverted bg-surface p-8 shadow-elevated">
          <JourneySourceVisual />
          <JourneyAccessVisual />
          <JourneyAnswerVisual />
        </div>
      </div>

      <div className={cn(
        "mx-auto max-w-7xl flex-col gap-14 px-5 py-20 sm:px-8",
        reduceMotion ? "flex" : "flex xl:hidden",
      )}>
        {stages.map((stage, index) => (
          <div key={stage.title} className="flex flex-col gap-5">
            <stage.icon className="text-amber-soft" size={26} weight="duotone" aria-hidden="true" />
            <h2 className="font-display text-3xl font-medium tracking-[-0.04em] text-text-inverted">
              {stage.title}
            </h2>
            <p className="text-base leading-7 text-text-inverted/62">{stage.body}</p>
            {index === 0 ? <JourneySourceVisual mobile /> : null}
            {index === 1 ? <JourneyAccessVisual mobile /> : null}
            {index === 2 ? <JourneyAnswerVisual mobile /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function JourneySourceVisual({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      data-journey-visual={mobile ? undefined : "source"}
      className={mobile ? "rounded-2xl border border-border bg-surface p-4" : "absolute inset-8"}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">內容各有用途</p>
          <p className="mt-1 text-sm text-text-muted">發布後，網站與 Agent API 共用同一來源</p>
        </div>
        <Badge variant="success">已發布</Badge>
      </div>
      <div className="grid gap-3">
        {sourceItems.map((item) => (
          <Item key={item.title} variant="muted" size="sm">
            <ItemMedia className="size-10 rounded-lg bg-surface text-accent">
              <item.icon size={20} weight="duotone" aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{item.title}</ItemTitle>
              <ItemDescription>{item.description}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </div>
    </div>
  );
}

function JourneyAccessVisual({ mobile = false }: { mobile?: boolean }) {
  const rows = [
    { icon: IdentificationCard, title: "CabAI 帳號", description: "課程權限與已讀狀態的真正擁有者" },
    { icon: Key, title: "Agent API Key", description: "可以替換、撤銷的存取憑證" },
    { icon: ShieldCheck, title: "權限檢查", description: "只回傳公開或帳號已取得的內容" },
  ] as const;

  return (
    <div
      data-journey-visual={mobile ? undefined : "access"}
      className={mobile ? "rounded-2xl border border-border bg-surface p-4" : "invisible absolute inset-8"}
    >
      <div className="mb-8">
        <p className="text-sm font-semibold text-text-primary">先確認身分，再回傳內容</p>
        <p className="mt-1 text-sm text-text-muted">Key 是憑證，不是另一個帳號</p>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.title}>
            <Item variant={index === 2 ? "outline" : "muted"} size="lg">
              <ItemMedia className="size-11 rounded-lg bg-accent-light text-accent">
                <row.icon size={22} weight="duotone" aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{row.title}</ItemTitle>
                <ItemDescription>{row.description}</ItemDescription>
              </ItemContent>
              {index === 2 ? <CheckCircle size={22} weight="fill" className="text-success" aria-hidden="true" /> : null}
            </Item>
            {index < rows.length - 1 ? (
              <div className="flex h-8 items-center justify-center text-text-muted" aria-hidden="true">
                <ArrowRight className="rotate-90" size={18} weight="bold" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneyAnswerVisual({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      data-journey-visual={mobile ? undefined : "answer"}
      className={mobile ? "rounded-2xl border border-border bg-surface p-4" : "invisible absolute inset-8"}
    >
      <div className="flex h-full flex-col rounded-2xl bg-ink p-5 text-text-inverted sm:p-7">
        <div className="flex items-center gap-3 border-b border-border-inverted/10 pb-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-surface/10 text-amber-soft">
            <Robot size={21} weight="duotone" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">你的 AI</p>
            <p className="mt-1 text-xs text-text-inverted/52">引用 CabAI 已授權內容</p>
          </div>
        </div>
        <div className="my-auto py-8">
          <p className="text-sm leading-7 text-text-inverted/82 sm:text-base">
            我已讀取你取得的課程與 Planseal Skill。這次先把需求整理成可驗收的行為，再拆成依賴清楚的工作包。
          </p>
          <div className="mt-6 rounded-xl border border-border-inverted/10 bg-surface/[0.06] p-4">
            <p className="font-mono text-xs text-amber-soft">SOURCE</p>
            <code className="mt-2 block break-all font-mono text-xs leading-5 text-text-inverted/58">
              GET /api/agent/public/v1/skills/planseal
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
