"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListBullets } from "@phosphor-icons/react";
import { Markdown } from "@/components/ui/markdown";
import {
  extractMarkdownHeadings,
  type MarkdownHeading,
} from "@/lib/markdown-headings";
import { stripDuplicateLeadingHeading } from "@/lib/lesson-content";

function ReadingGuide({
  progress,
  headings,
}: {
  progress: number;
  headings: MarkdownHeading[];
}) {
  return (
    <aside
      className="rounded-xl border border-border-subtle bg-surface p-4 xl:sticky xl:top-[calc(var(--site-header-height)+5.5rem)]"
      aria-label="本堂閱讀導覽"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-text-secondary">
          閱讀進度
        </span>
        <span className="font-mono text-xs tabular-nums text-text-muted">
          {progress}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="本堂閱讀進度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {headings.length >= 2 && (
        <details className="mt-4" open>
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ListBullets size={17} weight="duotone" />
            本堂目錄
          </summary>
          <nav className="mt-2 space-y-1 border-l border-border-subtle pl-3">
            {headings.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className="block rounded-sm py-1 text-xs leading-5 text-text-muted transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ paddingLeft: `${Math.max(0, heading.level - 2) * 8}px` }}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </details>
      )}
    </aside>
  );
}

export function LessonTextContent({
  content,
  title,
}: {
  content: string;
  title?: string;
}) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const normalizedContent = useMemo(
    () => stripDuplicateLeadingHeading(content, title),
    [content, title],
  );
  const headings = useMemo(
    () => extractMarkdownHeadings(normalizedContent, true),
    [normalizedContent],
  );

  useEffect(() => {
    const updateProgress = () => {
      const article = articleRef.current;
      if (!article) return;
      if (article.offsetHeight <= 0) {
        setProgress(0);
        return;
      }

      const rect = article.getBoundingClientRect();
      const readableDistance = Math.max(
        1,
        article.offsetHeight - window.innerHeight * 0.55,
      );
      const travelled = Math.min(
        readableDistance,
        Math.max(0, window.innerHeight * 0.25 - rect.top),
      );
      setProgress(Math.round((travelled / readableDistance) * 100));
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start">
      <ReadingGuide progress={progress} headings={headings} />
      <div ref={articleRef} className="min-w-0">
        <Markdown
          content={normalizedContent}
          demoteTopHeading
          headingAnchors
        />
      </div>
    </div>
  );
}
