"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowsSplit,
  Compass,
  MagnifyingGlass,
  Sparkle,
  Target,
  UsersThree,
} from "@phosphor-icons/react";
import type { PublicSkillProjection } from "@/lib/services/skill-release-service";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type SkillFilter = "all" | "public" | "authenticated" | `tag:${string}`;
type CategoryItem = { key: "all" | "public" | "authenticated"; label: string; count: number };

const topicLabels: Record<string, string> = {
  audience: "受眾",
  content: "內容",
  delegation: "委派",
  execution: "執行",
  governance: "治理",
  planning: "規劃",
  product: "產品",
  research: "研究",
  strategy: "策略",
  workflow: "工作流程",
};

function accessLabel(accessPolicy: PublicSkillProjection["currentRelease"]["accessPolicy"]): string {
  return accessPolicy === "public" ? "可直接使用" : "登入後下載";
}

function accessBadgeVariant(accessPolicy: PublicSkillProjection["currentRelease"]["accessPolicy"]): "success" | "info" {
  return accessPolicy === "public" ? "success" : "info";
}

function topicLabel(tag: string): string {
  return topicLabels[tag] ?? tag;
}

function skillPurpose(skill: PublicSkillProjection): { label: string; icon: React.ReactNode } {
  const tags = new Set(skill.tags);
  if (tags.has("delegation")) return { label: "委派與協作", icon: <ArrowsSplit size={21} weight="duotone" /> };
  if (tags.has("audience") || tags.has("content")) return { label: "內容與受眾", icon: <UsersThree size={21} weight="duotone" /> };
  if (tags.has("planning") || tags.has("strategy") || tags.has("architecture")) return { label: "規劃與驗證", icon: <Compass size={21} weight="duotone" /> };
  if (tags.has("execution") || tags.has("workflow")) return { label: "工作流程", icon: <Target size={21} weight="duotone" /> };
  return { label: "可重複使用的方法", icon: <Sparkle size={21} weight="duotone" /> };
}

function SkillRow({ skill }: { skill: PublicSkillProjection }) {
  const release = skill.currentRelease;
  const purpose = skillPurpose(skill);
  return (
    <li>
      <Link prefetch={false}
        href={`/skills/${skill.slug}`}
        className="group grid gap-4 px-4 py-5 transition-[background-color,color] hover:bg-surface-muted focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:scale-[0.995] sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      >
        <span className="flex min-w-0 gap-3 sm:gap-4">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-muted text-accent transition-colors group-hover:border-accent/40 group-hover:bg-accent-light sm:size-11" aria-hidden="true">
            {purpose.icon}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-text-primary group-hover:text-accent sm:text-lg">{skill.title}</h3>
              {release.status === "deprecated" ? <Badge variant="warning">已棄用</Badge> : null}
            </span>
            <span className="mt-1 block max-w-3xl text-sm leading-6 text-text-secondary">{skill.summary}</span>
            <span className="mt-3 block text-xs font-medium text-text-muted">{purpose.label}</span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3 md:border-0 md:pt-0">
          <Badge variant={accessBadgeVariant(release.accessPolicy)}>{accessLabel(release.accessPolicy)}</Badge>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors group-hover:text-accent">
            查看 Skill
            <ArrowUpRight size={17} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}

function FilterButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]",
        active
          ? "border-accent bg-accent text-text-inverted"
          : "border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function SkillCatalogClient({ skills }: { skills: PublicSkillProjection[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");

  const tagFilters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) for (const tag of skill.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort(([leftTag, leftCount], [rightTag, rightCount]) => rightCount - leftCount || topicLabel(leftTag).localeCompare(topicLabel(rightTag), "zh-TW"));
  }, [skills]);

  const categoryItems: CategoryItem[] = useMemo(() => [
    { key: "all", label: "全部", count: skills.length },
    { key: "public", label: "可直接使用", count: skills.filter((skill) => skill.currentRelease.accessPolicy === "public").length },
    { key: "authenticated", label: "登入後下載", count: skills.filter((skill) => skill.currentRelease.accessPolicy === "authenticated").length },
  ], [skills]);

  const hasMultipleAccessPolicies = new Set(skills.map((skill) => skill.currentRelease.accessPolicy)).size > 1;
  const showDiscoveryControls = skills.length >= 6;
  const showTopicFilters = showDiscoveryControls && tagFilters.length >= 2;

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
    return skills.filter((skill) => {
      const matchesQuery = !normalizedQuery || [skill.title, skill.summary, ...skill.tags].join(" ").toLocaleLowerCase("zh-TW").includes(normalizedQuery);
      const matchesFilter = filter === "all"
        || (filter === "public" && skill.currentRelease.accessPolicy === "public")
        || (filter === "authenticated" && skill.currentRelease.accessPolicy === "authenticated")
        || (filter.startsWith("tag:") && skill.tags.includes(filter.slice(4)));
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, skills]);

  const hasFilter = query.length > 0 || filter !== "all";
  const reset = () => { setQuery(""); setFilter("all"); };

  if (!skills.length) {
    return (
      <div className="flex flex-col gap-8">
        <header className="max-w-2xl">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">Skills</h1>
            <Badge variant="default" className="font-mono">0 個</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-text-secondary">這裡會整理可直接交給 AI 使用的工作方法與流程。</p>
        </header>
        <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center sm:px-10">
          <Sparkle size={28} className="mx-auto text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">目前還沒有公開 Skill</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-text-secondary">Skill 會在完成發布與檔案驗證後出現在這裡。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-2xl">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">Skills</h1>
          <Badge variant="default" className="font-mono">{skills.length} 個</Badge>
        </div>
        <p className="mt-3 text-sm leading-7 text-text-secondary">把可重複使用的工作方法交給 AI。每個 Skill 都提供人類可讀的說明，以及讓 Agent 取得內容的入口。</p>
      </header>

      {showDiscoveryControls ? (
        <section aria-label="篩選 Skill" className="rounded-xl border border-border-subtle bg-surface-muted p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <Input label="搜尋 Skills" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、用途或主題" className="bg-surface" />
            {hasMultipleAccessPolicies ? (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Skill 存取方式">
                {categoryItems.map((item) => (
                  <FilterButton key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
                    {item.label}
                    <span className="font-mono text-xs opacity-75">{item.count}</span>
                  </FilterButton>
                ))}
              </div>
            ) : null}
            {showTopicFilters ? (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Skill 主題">
                <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>全部主題</FilterButton>
                {tagFilters.map(([tag, count]) => {
                  const key = `tag:${tag}` as const;
                  return (
                    <FilterButton key={tag} active={filter === key} onClick={() => setFilter(key)}>
                      {topicLabel(tag)}
                      <span className="font-mono text-xs opacity-75">{count}</span>
                    </FilterButton>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="skill-results-heading" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="skill-results-heading" className="text-xl font-semibold tracking-tight text-text-primary">瀏覽公開 Skill</h2>
            <p className="mt-1 text-sm text-text-muted">{filteredSkills.length} 個可使用的工作方法{query ? `，搜尋「${query}」` : ""}</p>
          </div>
          {hasFilter ? <button type="button" onClick={reset} className="min-h-10 rounded-sm text-sm font-medium text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]">清除篩選</button> : null}
        </div>

        {filteredSkills.length ? (
          <ul aria-label="公開 Skill 清單" className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-card">
            {filteredSkills.map((skill) => <SkillRow key={skill.id} skill={skill} />)}
          </ul>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface px-6 py-16 text-center">
            <MagnifyingGlass size={28} className="mx-auto text-text-muted" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-text-primary">找不到符合的 Skill</h3>
            <p className="mt-2 text-sm text-text-secondary">換一個搜尋詞，或清除目前的分類篩選。</p>
          </div>
        )}
      </section>
    </div>
  );
}
