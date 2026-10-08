import type { ReactNode } from "react";
import {
  FileArrowDown,
  FilePdf,
  LinkSimple,
  PlayCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Markdown } from "@/components/ui/markdown";
import { TrackResource } from "@/components/track-resource";
import {
  isEmbeddableVideoUrl,
  normalizeVideoUrl,
  stripDuplicateLeadingHeading,
  type LessonContentType,
  type LessonResource,
} from "@/lib/lesson-content";
import { LessonTextContent } from "@/components/learning/lesson-text-content";

interface ContentRendererProps {
  type: LessonContentType;
  content: string;
  title?: string;
  resources?: LessonResource[];
  demoteTopHeading?: boolean;
  readingTools?: boolean;
}

function ResourceList({ resources }: { resources: LessonResource[] }) {
  if (resources.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">
        補充資源
      </h2>
      <div className="mt-4 space-y-4">
        {resources.map((resource) => {
          const url =
            resource.type === "video"
              ? normalizeVideoUrl(resource.url)
              : resource.url;

          if (resource.type === "video") {
            return (
              <div key={resource.id} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <PlayCircle size={18} weight="duotone" />
                  {resource.title}
                </div>
                {isEmbeddableVideoUrl(url) ? (
                  <div
                    className="relative w-full overflow-hidden rounded-lg bg-ink"
                    style={{ paddingBottom: "56.25%" }}
                  >
                    <iframe
                      src={url}
                      className="absolute inset-0 h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      title={resource.title}
                    />
                  </div>
                ) : (
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    className="aspect-video w-full rounded-lg bg-ink"
                  />
                )}
              </div>
            );
          }

          const Icon =
            resource.type === "pdf"
              ? FilePdf
              : resource.type === "download"
                ? FileArrowDown
                : LinkSimple;
          const isDownload = resource.type === "download";

          return (
            <TrackResource
              key={resource.id}
              eventType={isDownload ? "resource_downloaded" : "resource_opened"}
              resourceId={resource.id}
              resourceType={resource.type}
              resourceTitle={resource.title}
            >
              <a
                href={url}
                target={isDownload ? undefined : "_blank"}
                rel={isDownload ? undefined : "noopener noreferrer"}
                download={isDownload}
                className="flex items-center gap-3 rounded-md border border-border-subtle px-4 py-3 text-sm transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.995]"
              >
                <Icon size={20} weight="duotone" className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                  {resource.title}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {isDownload ? "下載" : "開啟"}
                </span>
              </a>
            </TrackResource>
          );
        })}
      </div>
    </section>
  );
}

export function ContentRenderer({
  type,
  content,
  title,
  resources = [],
  demoteTopHeading = false,
  readingTools = false,
}: ContentRendererProps) {
  let renderedContent: ReactNode = null;
  const normalizedContent = type === "video" ? normalizeVideoUrl(content) : content;

  switch (type) {
    case "video":
      if (isEmbeddableVideoUrl(normalizedContent)) {
        renderedContent = (
          <div
            className="relative w-full overflow-hidden rounded-lg bg-ink shadow-sm"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              src={normalizedContent}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={title ?? "課程影片"}
            />
          </div>
        );
        break;
      }
      renderedContent = (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-ink shadow-sm">
          <video
            src={normalizedContent}
            controls
            preload="metadata"
            className="h-full w-full"
          />
        </div>
      );
      break;

    case "text":
      renderedContent = readingTools ? (
        <LessonTextContent content={content} title={title} />
      ) : (
        <article className="mx-auto max-w-prose">
          <Markdown
            content={stripDuplicateLeadingHeading(content, title)}
            demoteTopHeading={demoteTopHeading}
          />
        </article>
      );
      break;

    case "pdf":
      renderedContent = (
        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface p-5 shadow-sm sm:flex-row sm:items-center">
          <FilePdf
            size={36}
            weight="duotone"
            className="shrink-0 text-red-500"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {title ?? "PDF 文件"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              可開啟預覽，也可以下載後離線閱讀。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={content}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
            >
              開啟 PDF
            </a>
            <a
              href={content}
              download
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-ink px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
            >
              下載
            </a>
          </div>
        </div>
      );
      break;

    case "download":
      renderedContent = (
        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface p-5 shadow-sm sm:flex-row sm:items-center">
          <FileArrowDown
            size={36}
            weight="duotone"
            className="shrink-0 text-amber-soft"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {title ?? "課程附件"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              下載這份附件，搭配課程內容使用。
            </p>
          </div>
          <a
            href={content}
            download
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <FileArrowDown size={16} weight="bold" />
            下載附件
          </a>
        </div>
      );
      break;

    default:
      renderedContent = null;
  }

  return (
    <>
      {renderedContent}
      <ResourceList resources={resources} />
    </>
  );
}
