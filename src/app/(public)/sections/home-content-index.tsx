"use client";

import { PUBLIC_BRANDING } from "@/lib/config/public-branding";


import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  Database,
  Robot,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HomeSectionBackdrop } from "./home-section-backdrop";

export type HomeContentKind = "information" | "library" | "skills" | "courses";

export interface HomeContentEntry {
  id: string;
  title: string;
  summary: string;
  href: string;
  meta: string;
}

export interface HomeContentGroup {
  kind: HomeContentKind;
  label: string;
  description: string;
  href: string;
  entries: HomeContentEntry[];
}

const groupIcons = {
  information: Sparkle,
  library: Database,
  skills: BracketsCurly,
  courses: BookOpenText,
} as const;

const groupRoles = {
  information: "掌握最新變化",
  library: "查完整資料",
  skills: "交給 AI 使用",
  courses: "建立完整能力",
} as const;

const groupUseCases = {
  information: { human: "閱讀平台消息", agent: "取得未讀更新" },
  library: { human: "閱讀完整指南", agent: "引用公開來源" },
  skills: { human: "查看使用方式", agent: "採用工作流程" },
  courses: { human: "進入課程學習", agent: "依權限取得內容" },
} as const;

export function HomeContentIndexSection({ groups }: { groups: HomeContentGroup[] }) {
  const defaultGroup = groups.find((group) => group.entries.length > 0)?.kind ?? "courses";

  return (
    <section
      id="discover"
      className="home-section-deferred relative isolate overflow-hidden border-b border-border-subtle bg-surface"
    >
      <HomeSectionBackdrop
        src={PUBLIC_BRANDING.illustration}
        placement="right"
        imageClassName="object-[78%_center]"
        className="opacity-[0.14] sm:opacity-[0.2]"
        overlayClassName="bg-[linear-gradient(90deg,rgba(251,252,251,0.99)_0%,rgba(251,252,251,0.96)_50%,rgba(251,252,251,0.64)_100%)]"
      />

      <div className="mx-auto max-w-[90rem] px-5 py-16 sm:px-8 sm:py-20 lg:py-28 xl:px-12 xl:py-32">
        <header data-home-reveal className="max-w-4xl">
          <h2 className="font-display text-4xl font-medium leading-[1.04] tracking-[-0.045em] text-text-primary sm:text-5xl md:text-[3.5rem]">
            想找什麼，就從這裡開始
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-8 text-text-secondary sm:text-lg">
            公告、Library、Skill 和課程各自處理不同需求。選一個方向，就能打開現在最需要的內容。
          </p>
        </header>

        <Tabs
          data-home-reveal
          defaultValue={defaultGroup}
          className="mt-12 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16"
        >
          <TabsList
            aria-label="選擇內容類型"
            className="grid h-auto grid-cols-2 items-stretch border-y border-border bg-transparent sm:grid-cols-4 lg:flex lg:flex-col lg:border-y-0 lg:border-l"
          >
            {groups.map((group) => {
              const Icon = groupIcons[group.kind];
              return (
                <TabsTrigger
                  key={group.kind}
                  value={group.kind}
                  className="min-h-16 min-w-0 justify-start gap-3 px-3 py-4 text-left sm:px-4 lg:min-h-0 lg:w-full lg:border-b lg:border-l-2 lg:px-5 lg:py-5 lg:data-[state=active]:bg-accent-light/35"
                >
                  <Icon className="shrink-0 text-accent" size={19} weight="duotone" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate">{group.label}</span>
                    <span className="mt-1 hidden text-xs font-normal text-text-muted lg:block">
                      {groupRoles[group.kind]}
                    </span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {groups.map((group) => {
            const Icon = groupIcons[group.kind];
            const useCase = groupUseCases[group.kind];
            const [featured, ...rest] = group.entries;

            return (
              <TabsContent key={group.kind} value={group.kind} className="mt-0 min-w-0">
                <div className="flex flex-col gap-5 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
                    {group.description}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-text-muted sm:text-sm">
                    <span className="inline-flex items-center gap-2">
                      <UserCircle size={18} weight="duotone" aria-hidden="true" />
                      {useCase.human}
                    </span>
                    <span
                      data-home-flow
                      className="h-px w-7 origin-left bg-border-strong"
                      aria-hidden="true"
                    />
                    <span className="inline-flex items-center gap-2 text-accent">
                      <Robot size={18} weight="duotone" aria-hidden="true" />
                      {useCase.agent}
                    </span>
                  </div>
                </div>

                {featured ? (
                  <>
                    <Link prefetch={false}
                      href={featured.href}
                      className="group grid gap-8 py-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:grid-cols-[minmax(0,1.35fr)_minmax(10rem,0.65fr)] md:items-end md:py-12"
                    >
                      <div>
                        <Badge>{featured.meta}</Badge>
                        <h3 className="mt-6 max-w-3xl font-display text-3xl font-medium leading-[1.08] tracking-[-0.04em] text-text-primary transition-colors group-hover:text-accent group-focus-visible:text-accent sm:text-4xl lg:text-5xl">
                          {featured.title}
                        </h3>
                        <p className="mt-5 line-clamp-3 max-w-2xl text-sm leading-7 text-text-secondary sm:text-base sm:leading-8">
                          {featured.summary}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-5 md:flex-col md:items-end">
                        <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-surface-elevated text-accent shadow-card transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
                          <Icon size={28} weight="duotone" aria-hidden="true" />
                        </span>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
                          開啟內容
                          <ArrowRight className="transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1" size={18} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>

                    {rest.length > 0 ? (
                      <div className="grid border-t border-border md:grid-cols-2 md:gap-x-10">
                        {rest.slice(0, 2).map((entry) => (
                          <Link prefetch={false}
                            key={entry.id}
                            href={entry.href}
                            className="group flex min-w-0 items-start justify-between gap-5 border-b border-border py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-accent">{entry.meta}</p>
                              <h4 className="mt-2 line-clamp-2 font-display text-lg font-medium leading-snug text-text-primary transition-colors group-hover:text-accent group-focus-visible:text-accent">
                                {entry.title}
                              </h4>
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                                {entry.summary}
                              </p>
                            </div>
                            <ArrowRight className="mt-1 shrink-0 text-text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-accent group-focus-visible:translate-x-1 group-focus-visible:text-accent" size={18} weight="bold" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Item variant="muted" size="lg" className="mt-8">
                    <ItemContent>
                      <ItemTitle>目前沒有已發布內容</ItemTitle>
                      <ItemDescription>這個分類有新內容時，會直接出現在這裡。</ItemDescription>
                    </ItemContent>
                  </Item>
                )}

                <div className="mt-7 flex justify-end">
                  <Button asChild variant="ghost" className="px-0 hover:bg-transparent hover:text-accent">
                    <Link prefetch={false} href={group.href}>
                      查看所有{group.label}
                      <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </section>
  );
}
