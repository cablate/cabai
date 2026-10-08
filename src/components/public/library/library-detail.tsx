import Link from "next/link";
import type {
  LibraryPublicDetail,
  LibraryPublicSummary,
} from "@/lib/services/library-service";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Separator } from "@/components/ui/separator";
import { LibraryTags } from "./library-index";
import { LibraryMarkdown } from "./library-markdown";
import {
  estimateLibraryReadingMinutes,
  hasMeaningfulLibraryUpdate,
} from "@/lib/seo/library-article";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Taipei" }).format(value);
}

export function LibraryDetail({
  entry,
  relatedEntries = [],
  relatedByTag = false,
}: {
  entry: LibraryPublicDetail;
  relatedEntries?: LibraryPublicSummary[];
  relatedByTag?: boolean;
}) {
  const readingMinutes = estimateLibraryReadingMinutes(entry.bodyMarkdown);
  const showUpdatedAt = hasMeaningfulLibraryUpdate(entry.publishedAt, entry.updatedAt);

  return (
    <article className="min-h-[70vh] bg-surface text-text-primary">
      <header className="bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
          <Link prefetch={false} href="/library" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <ArrowLeft size={17} aria-hidden="true" />
            返回 Library
          </Link>

          <div className="mt-8 max-w-3xl">
            <h1 className="text-balance font-display text-3xl font-medium leading-tight tracking-[-0.04em] text-text-primary sm:text-4xl">{entry.title}</h1>
            <p className="mt-4 text-pretty text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">{entry.summary}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-muted">
              {entry.publishedAt ? <time dateTime={entry.publishedAt.toISOString()}>發布於 {formatDate(entry.publishedAt)}</time> : null}
              {showUpdatedAt ? <time dateTime={entry.updatedAt.toISOString()}>更新於 {formatDate(entry.updatedAt)}</time> : null}
              <span>約 {readingMinutes} 分鐘閱讀</span>
              {entry.tags.length > 0 ? <Separator orientation="vertical" className="hidden h-4 w-px sm:block" /> : null}
              <LibraryTags tags={entry.tags} />
            </div>
          </div>
        </div>
      </header>

      <Separator />

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <LibraryMarkdown content={entry.bodyMarkdown} />
      </div>

      {relatedEntries.length > 0 ? (
        <aside
          aria-labelledby="related-library-heading"
          className="border-t border-border-subtle bg-surface-hover/45"
        >
          <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-12">
            <div className="flex items-end justify-between gap-4">
              <h2
                id="related-library-heading"
                className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
              >
                {relatedByTag ? "相關文章" : "繼續閱讀"}
              </h2>
              <Link prefetch={false}
                href="/library"
                className="min-h-10 text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                全部文章
              </Link>
            </div>
            <div className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
              {relatedEntries.map((related) => (
                <article
                  key={related.id}
                  className="grid gap-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold text-text-primary">
                      <Link prefetch={false}
                        href={`/library/${related.slug}`}
                        className="rounded-sm transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {related.title}
                      </Link>
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                      {related.summary}
                    </p>
                  </div>
                  <Link prefetch={false}
                    href={`/library/${related.slug}`}
                    aria-label={`閱讀 ${related.title}`}
                    className="inline-flex min-h-10 w-fit items-center text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    閱讀
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </article>
  );
}
