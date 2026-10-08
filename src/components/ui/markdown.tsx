"use client";

import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  extractMarkdownHeadings,
  headingSlug,
} from "@/lib/markdown-headings";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, "");

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="group relative my-6 overflow-hidden rounded-lg bg-surface-code text-text-code">
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border-inverted bg-surface-elevated/10 px-2.5 py-1.5 text-xs font-medium text-text-code backdrop-blur",
          "transition-[background-color,border-color,transform] hover:bg-surface-elevated/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]",
        )}
        aria-label={copied ? "程式碼已複製" : "複製程式碼"}
      >
        {copied ? (
          <Check size={14} weight="bold" />
        ) : (
          <Copy size={14} weight="bold" />
        )}
        <span>{copied ? "已複製" : "複製"}</span>
      </button>
      <pre className="m-0 overflow-x-hidden whitespace-pre-wrap bg-transparent p-4 pr-24 text-sm leading-6 [overflow-wrap:anywhere]">
        {children}
      </pre>
    </div>
  );
}

function MarkdownImage({
  src,
  alt,
  ...props
}: ComponentPropsWithoutRef<"img">) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!src) return null;

  const previewDialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-strong p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `圖片預覽：${alt}` : "圖片預覽"}
      onClick={() => setOpen(false)}
    >
      <button
        type="button"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-inverted bg-surface-elevated/10 text-text-inverted transition-[background-color,border-color,transform] hover:bg-surface-elevated/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-inverted active:scale-[0.94]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(false);
        }}
        aria-label="關閉圖片預覽"
      >
        <X size={20} weight="bold" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="group my-6 block max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-border-subtle bg-surface-muted p-0 text-left transition-[border-color,box-shadow,transform] hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:shadow-card active:scale-[0.995]"
        onClick={() => setOpen(true)}
        aria-label={alt ? `放大圖片：${alt}` : "放大圖片"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...props}
          src={src}
          alt={alt ?? ""}
          className={cn(
            "m-0 h-auto max-w-full rounded-lg transition duration-200 group-hover:scale-[1.01]",
            props.className,
          )}
        />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(previewDialog, document.body)
        : null}
    </>
  );
}

/**
 * Renders markdown content with GFM support (tables, strikethrough, task lists).
 * Wrapped in prose classes for consistent typography.
 */
export function Markdown({
  content,
  demoteTopHeading = false,
  headingAnchors = false,
}: {
  content: string;
  demoteTopHeading?: boolean;
  headingAnchors?: boolean;
}) {
  const headingIdByLine = new Map(
    extractMarkdownHeadings(content, demoteTopHeading).map((heading) => [
      heading.line,
      heading.id,
    ]),
  );
  const anchoredHeading = (
    level: 1 | 2 | 3 | 4,
    children: ReactNode,
    line?: number,
  ) => {
    const id =
      (line != null ? headingIdByLine.get(line) : undefined) ??
      headingSlug(extractText(children));

    if (level === 1) return <h1 id={id}>{children}</h1>;
    if (level === 2) return <h2 id={id}>{children}</h2>;
    if (level === 3) return <h3 id={id}>{children}</h3>;
    return <h4 id={id}>{children}</h4>;
  };

  return (
    <article className="prose prose-semantic min-w-0 max-w-[72ch] [overflow-wrap:anywhere] [word-break:break-word] prose-headings:scroll-mt-32 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-12 prose-h2:border-b prose-h2:border-border-subtle prose-h2:pb-3 prose-h3:mt-9 prose-p:leading-8 prose-p:[overflow-wrap:anywhere] prose-a:text-accent prose-a:underline prose-a:decoration-accent/35 prose-a:underline-offset-4 hover:prose-a:decoration-accent prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-accent/50 prose-blockquote:bg-surface-muted prose-blockquote:px-5 prose-blockquote:py-1 prose-blockquote:not-italic prose-li:my-1.5 prose-code:rounded prose-code:bg-surface-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-img:my-8 prose-img:rounded-xl prose-table:text-sm prose-th:bg-surface-muted prose-th:px-3 prose-td:px-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_pre_code]:before:content-none [&_pre_code]:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...(headingAnchors
            ? {
                h1: ({ children, node }) =>
                  anchoredHeading(
                    demoteTopHeading ? 2 : 1,
                    children,
                    node?.position?.start.line,
                  ),
                h2: ({ children, node }) =>
                  anchoredHeading(2, children, node?.position?.start.line),
                h3: ({ children, node }) =>
                  anchoredHeading(3, children, node?.position?.start.line),
                h4: ({ children, node }) =>
                  anchoredHeading(4, children, node?.position?.start.line),
              }
            : demoteTopHeading
              ? { h1: ({ children }) => <h2>{children}</h2> }
              : {}),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          img: (props) => <MarkdownImage {...props} />,
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "rounded-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-80",
                props.className,
              )}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
