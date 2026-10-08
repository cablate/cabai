import type { LibraryPublicSummary } from "@/lib/services/library-service";
import { Badge } from "@/components/ui/badge";
import { LibraryIndexClient } from "./library-index-client";

export function LibraryTags({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="文章標籤" className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag} className="rounded-full border border-border-subtle bg-surface-muted/70 px-2.5 py-1 text-xs font-medium text-text-secondary">
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function LibraryIndex({ entries }: { entries: LibraryPublicSummary[] }) {
  if (!entries.length) {
    return (
      <div className="min-h-[70vh] bg-surface-hover/45">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
          <header className="grid gap-4 border-b border-border-subtle pb-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-8">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-medium tracking-[-0.035em] text-text-primary">Library</h1>
              <Badge variant="default" className="font-mono">0 篇</Badge>
            </div>
            <p className="max-w-xl text-sm leading-6 text-text-secondary sm:justify-self-end sm:text-right">這裡整理可直接閱讀與分享的公開指南、技術筆記與參考資料，也可以提供給你的 AI 使用。</p>
          </header>
          <section className="border-y border-dashed border-border-strong bg-surface px-6 py-14 text-center sm:px-10">
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">文章正在整理中</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-text-secondary sm:text-base">目前還沒有已發布的文章。新的技術筆記與實作指南準備好後，會出現在這裡。</p>
          </section>
        </div>
      </div>
    );
  }

  return <LibraryIndexClient entries={entries} />;
}
