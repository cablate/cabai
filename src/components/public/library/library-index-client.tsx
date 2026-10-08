"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { LibraryPublicSummary } from "@/lib/services/library-service";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type LibraryFilter = "all" | `tag:${string}`;
type Topic = [string, number];

function PublishedTime({ value }: { value: Date | null }) {
  if (!value) return <span>尚未發布</span>;
  return (
    <time dateTime={value.toISOString()}>
      {new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Taipei" }).format(value)}
    </time>
  );
}

function getTopics(entries: LibraryPublicSummary[]): Topic[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-TW"));
}

function TopicFilterButton({
  label,
  count,
  active,
  onSelect,
  closeOnSelect = false,
  className,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  closeOnSelect?: boolean;
  className?: string;
}) {
  const button = (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]",
        className,
        active ? "bg-accent-light font-semibold text-accent" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="ml-3 shrink-0 font-mono text-xs text-text-muted">{count}</span>
    </button>
  );

  return closeOnSelect ? <SheetClose asChild>{button}</SheetClose> : button;
}

function TopicList({
  topics,
  total,
  filter,
  onFilter,
  closeOnSelect = false,
  horizontal = false,
}: {
  topics: Topic[];
  total: number;
  filter: LibraryFilter;
  onFilter: (value: LibraryFilter) => void;
  closeOnSelect?: boolean;
  horizontal?: boolean;
}) {
  return (
    <nav aria-label="Library 主題" className={horizontal ? "flex items-center gap-3" : undefined}>
      <p className={cn("text-xs font-semibold text-text-muted", horizontal ? "shrink-0" : "mb-2")}>主題</p>
      <ul aria-label="Library 主題" className={cn("flex gap-1", horizontal ? "min-w-0 flex-1 overflow-x-auto pb-1" : "flex-col")}>
        <li className={horizontal ? "shrink-0" : undefined}>
          <TopicFilterButton label="全部" count={total} active={filter === "all"} onSelect={() => onFilter("all")} closeOnSelect={closeOnSelect} className={horizontal ? "w-auto shrink-0" : undefined} />
        </li>
        {topics.map(([topic, count]) => {
          const key = `tag:${topic}` as const;
          return (
            <li key={topic} className={horizontal ? "shrink-0" : undefined}>
              <TopicFilterButton label={topic} count={count} active={filter === key} onSelect={() => onFilter(key)} closeOnSelect={closeOnSelect} className={horizontal ? "w-auto shrink-0" : undefined} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileTopicSheet({ topics, total, filter, onFilter, activeLabel }: { topics: Topic[]; total: number; filter: LibraryFilter; onFilter: (value: LibraryFilter) => void; activeLabel: string | null }) {
  if (!topics.length) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className="min-h-11 shrink-0" aria-label="開啟 Library 主題篩選">
          <Funnel size={17} aria-hidden="true" />
          主題
          {activeLabel ? <Badge variant="info" className="ml-1 px-2 py-0.5">{activeLabel}</Badge> : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-surface text-text-primary">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <SheetTitle className="text-lg font-semibold text-text-primary">Library 主題</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-text-secondary">選擇主題後，清單會立即更新。</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="關閉篩選"><X size={18} /></Button>
          </SheetClose>
        </div>
        <div className="overflow-y-auto p-5">
          <TopicList topics={topics} total={total} filter={filter} onFilter={onFilter} closeOnSelect />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ArticleTags({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <ul aria-label="文章標籤" className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-accent">
      {tags.map((tag) => <li key={tag}>#{tag}</li>)}
    </ul>
  );
}

function ArticleRow({ entry, featured = false }: { entry: LibraryPublicSummary; featured?: boolean }) {
  return (
    <article className={cn(
      "group border-b border-border-subtle bg-surface px-4 py-5 last:border-b-0 sm:px-6 sm:py-6",
      featured && "border-l-2 border-l-accent bg-accent-light/25 sm:px-7",
    )}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-muted">
        {featured ? <span className="font-mono font-semibold uppercase tracking-[0.16em] text-accent">精選</span> : null}
        <PublishedTime value={entry.publishedAt} />
      </div>
      <h3 className={cn("mt-3 text-lg font-semibold tracking-tight text-text-primary sm:text-xl", featured && "sm:text-2xl")}>
        <Link prefetch={false} href={`/library/${entry.slug}`} className="rounded-sm text-balance transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          {entry.title}
        </Link>
      </h3>
      <p className="mt-3 max-w-3xl text-pretty text-sm leading-7 text-text-secondary sm:text-base">{entry.summary}</p>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <ArticleTags tags={entry.tags} />
        <Link prefetch={false} href={`/library/${entry.slug}`} aria-label={`閱讀 ${entry.title}`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          閱讀文章
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function LibraryIndexClient({ entries }: { entries: LibraryPublicSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const topics = useMemo(() => getTopics(entries), [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
    return entries.filter((entry) => {
      const matchesQuery = !normalizedQuery || [entry.title, entry.summary, ...entry.tags]
        .join(" ")
        .toLocaleLowerCase("zh-TW")
        .includes(normalizedQuery);
      const matchesFilter = filter === "all" || entry.tags.includes(filter.slice(4));
      return matchesQuery && matchesFilter;
    });
  }, [entries, filter, query]);

  const featured = filteredEntries.filter((entry) => entry.featured);
  const latest = filteredEntries.filter((entry) => !entry.featured);
  const hasFilter = query.length > 0 || filter !== "all";
  const activeTopicLabel = filter.startsWith("tag:") ? filter.slice(4) : null;
  const reset = () => { setQuery(""); setFilter("all"); };

  return (
    <div className="min-h-[70vh] bg-surface-hover/45">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <header className="grid gap-4 border-b border-border-subtle pb-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-8">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">Library</h1>
            <Badge variant="default" className="font-mono">{entries.length} 篇</Badge>
          </div>
          <p className="max-w-xl text-sm leading-6 text-text-secondary sm:justify-self-end sm:text-right">這裡整理可直接閱讀與分享的公開指南、技術筆記與參考資料，也可以提供給你的 AI 使用。</p>
        </header>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <Input label="搜尋文章" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、摘要或主題" className="bg-surface" />
            <div className="md:hidden">
              <MobileTopicSheet topics={topics} total={entries.length} filter={filter} onFilter={setFilter} activeLabel={activeTopicLabel} />
            </div>
          </div>
          <div className="hidden md:block">
            <TopicList topics={topics} total={entries.length} filter={filter} onFilter={setFilter} horizontal />
          </div>
        </div>

        <main aria-labelledby="library-results-heading" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border-strong pb-4">
            <div>
              <h2 id="library-results-heading" className="text-xl font-semibold tracking-tight text-text-primary">文章</h2>
              <p className="mt-1 text-sm text-text-muted">{filteredEntries.length} 篇結果{query ? `，符合「${query}」` : ""}</p>
            </div>
            {hasFilter ? <button type="button" onClick={reset} className="min-h-10 rounded-sm text-sm font-medium text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]">清除篩選</button> : null}
          </div>

          {filteredEntries.length ? (
            <div className="flex flex-col gap-10">
              {featured.length ? (
                <section aria-labelledby="featured-library-heading">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <h2 id="featured-library-heading" className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">精選文章</h2>
                    <span className="font-mono text-xs text-text-muted">{featured.length.toString().padStart(2, "0")}</span>
                  </div>
                  <div className="overflow-hidden border-y border-border-subtle">{featured.map((entry) => <ArticleRow key={entry.id} entry={entry} featured />)}</div>
                </section>
              ) : null}
              {latest.length ? (
                <section aria-labelledby="latest-library-heading">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <h2 id="latest-library-heading" className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">最新文章</h2>
                    <span className="font-mono text-xs text-text-muted">依發布時間排序</span>
                  </div>
                  <div className="overflow-hidden border-y border-border-subtle">{latest.map((entry) => <ArticleRow key={entry.id} entry={entry} />)}</div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="border-y border-border-subtle bg-surface px-6 py-16 text-center">
              <MagnifyingGlass size={28} className="mx-auto text-text-muted" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-text-primary">找不到符合的文章</h2>
              <p className="mt-2 text-sm text-text-secondary">換個關鍵字或清除篩選，再試一次。</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
