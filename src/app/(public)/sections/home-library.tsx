import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { LibraryPublicSummary } from "@/lib/services/library-service";

function formatDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Taipei",
  }).format(value);
}

export function HomeLibrarySection({
  entries,
}: {
  entries: LibraryPublicSummary[];
}) {
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="home-library-heading"
      className="border-b border-border-subtle bg-surface"
    >
      <div className="mx-auto max-w-[90rem] px-5 py-12 sm:px-8 sm:py-16 xl:px-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs font-semibold tracking-[0.14em] text-accent">
              LIBRARY
            </p>
            <h2
              id="home-library-heading"
              className="mt-2 font-display text-2xl font-medium tracking-[-0.035em] text-text-primary sm:text-3xl"
            >
              最近整理的內容
            </h2>
          </div>
          <Link prefetch={false}
            href="/library"
            className="group hidden min-h-10 items-center gap-2 rounded-sm text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
          >
            查看全部
            <ArrowRight
              size={17}
              className="transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>

        <div className="mt-7 divide-y divide-border-subtle border-y border-border-subtle">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="group grid gap-3 py-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6"
            >
              <div className="flex items-center gap-3 text-xs text-text-muted sm:block">
                {entry.featured ? (
                  <span className="font-mono font-semibold text-accent">精選</span>
                ) : null}
                {entry.publishedAt ? (
                  <time
                    dateTime={entry.publishedAt.toISOString()}
                    className={entry.featured ? "sm:mt-1 sm:block" : undefined}
                  >
                    {formatDate(entry.publishedAt)}
                  </time>
                ) : null}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-text-primary">
                  <Link prefetch={false}
                    href={`/library/${entry.slug}`}
                    className="rounded-sm transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {entry.title}
                  </Link>
                </h3>
                <p className="mt-1 line-clamp-1 text-sm leading-6 text-text-secondary">
                  {entry.summary}
                </p>
              </div>
              <Link prefetch={false}
                href={`/library/${entry.slug}`}
                aria-label={`閱讀 ${entry.title}`}
                className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                閱讀
                <ArrowUpRight
                  size={16}
                  className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </article>
          ))}
        </div>

        <Link prefetch={false}
          href="/library"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
        >
          查看全部文章
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
