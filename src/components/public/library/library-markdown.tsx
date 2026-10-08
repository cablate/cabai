import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function safeLink(href: string | undefined): { href: string; external: boolean } | null {
  if (!href) return null;
  if ((href.startsWith("/") && !href.startsWith("//")) || href.startsWith("./") || href.startsWith("../") || href.startsWith("#") || href.startsWith("?")) {
    return { href, external: false };
  }
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { href: url.toString(), external: true };
  } catch {
    return null;
  }
}

function MarkdownLink({ href, children, ...props }: ComponentPropsWithoutRef<"a"> & { children?: ReactNode }) {
  const link = safeLink(href);
  if (!link) return <span>{children}</span>;
  return <a {...props} href={link.href} className={cn("rounded-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-80", props.className)} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
}

export function LibraryMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-semantic min-w-0 max-w-none [overflow-wrap:anywhere] prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-12 prose-h2:border-b prose-h2:border-border-subtle prose-h2:pb-3 prose-h3:mt-8 prose-p:leading-8 prose-a:text-accent prose-a:underline prose-a:decoration-accent/35 prose-a:underline-offset-4 hover:prose-a:decoration-accent prose-blockquote:border-l-2 prose-blockquote:border-accent prose-blockquote:bg-surface-muted prose-blockquote:px-5 prose-blockquote:py-1 prose-blockquote:not-italic prose-li:my-1.5 prose-code:rounded prose-code:bg-surface-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeLink(url)?.href ?? ""}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          a: MarkdownLink,
          img: () => null,
          pre: ({ children }) => <pre tabIndex={0} className="max-w-full overflow-x-auto rounded-lg bg-surface-code p-4 text-sm leading-6 text-text-code">{children}</pre>,
          table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
