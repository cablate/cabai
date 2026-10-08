import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentRenderer } from "@/components/content-renderer";
import { BRAND_NAME, LESSON_TYPE_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { planPath } from "@/lib/plan-url";
import {
  getBillingLabel,
  getPreviewContinuationCopy,
} from "@/lib/public-offering-copy";
import {
  getPublishedPreviewContext,
  type PublishedPreviewContext,
} from "@/lib/queries/course-catalog";
import {
  ArrowUpRight,
  CaretLeft,
  Eye,
  Lock,
} from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";
const siteName = BRAND_NAME;

interface PreviewPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export async function generateMetadata({
  params,
}: PreviewPageProps): Promise<Metadata> {
  const { courseId, lessonId } = await params;
  const ctx: PublishedPreviewContext | null =
    await getPublishedPreviewContext(courseId, lessonId);
  if (!ctx) return { title: `免費試看 — ${siteName}` };

  return {
    title: `${ctx.lesson.title}（免費試看）`,
    description: `${ctx.course.title} 的免費試看片段`,
    robots: { index: false, follow: true },
  };
}

export default async function PreviewLessonPage({ params }: PreviewPageProps) {
  const { courseId, lessonId } = await params;
  const ctx: PublishedPreviewContext | null =
    await getPublishedPreviewContext(courseId, lessonId);
  if (!ctx) notFound();

  const { lesson, course, plan, outline, flatPreviews } = ctx;
  const typeLabel = LESSON_TYPE_LABELS[lesson.type] ?? lesson.type;
  const productHref = plan ? planPath(plan, "product") : "/products";
  const isFreeAccess = plan?.purchaseButtonMode === "free_claim";
  const continuationCopy = plan
    ? getPreviewContinuationCopy(plan.name, isFreeAccess)
    : null;

  const currentIdx = flatPreviews.findIndex((p) => p.id === lesson.id);
  const prevPreview = currentIdx > 0 ? flatPreviews[currentIdx - 1] : null;
  const nextPreview =
    currentIdx >= 0 && currentIdx < flatPreviews.length - 1
      ? flatPreviews[currentIdx + 1]
      : null;

  return (
    <article className="min-h-screen bg-surface-hover">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <nav className="mb-6 flex items-center gap-2 text-sm text-text-muted">
          <Link prefetch={false}
            href={productHref}
            className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <CaretLeft size={14} weight="bold" />
            {course.title}
          </Link>
          <span>/</span>
          <span className="text-text-secondary">免費試看</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-6">
              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                <Eye size={12} weight="fill" />
                免費試看
              </span>
              <h1 className="mt-3 text-2xl font-semibold text-text-primary md:text-3xl">
                {lesson.title}
              </h1>
              <p className="mt-1 text-xs text-text-muted">{typeLabel}</p>
            </div>

            <ContentRenderer
              type={lesson.type}
              content={lesson.content}
              title={lesson.title}
              resources={lesson.resources}
            />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {prevPreview ? (
                <Link prefetch={false}
                  href={`/preview/${courseId}/${prevPreview.id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
                >
                  &larr; 上一個試看
                </Link>
              ) : (
                <span />
              )}
              {nextPreview && (
                <Link prefetch={false}
                  href={`/preview/${courseId}/${nextPreview.id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.98]"
                >
                  下一個試看 &rarr;
                </Link>
              )}
            </div>

            {plan && (
              <div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 md:p-8">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">
                  {continuationCopy?.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-text-primary md:text-2xl">
                  {continuationCopy?.title}
                </h2>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] text-text-muted">
                      {isFreeAccess ? "費用" : "定價"}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-text-primary">
                      {formatPrice(plan.amount)}
                      <span className="ml-2 text-sm font-normal text-text-muted">
                        {getBillingLabel(plan.billingPeriod, isFreeAccess)}
                      </span>
                    </p>
                  </div>
                  <Link prefetch={false}
                    href={productHref}
                    className="group inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
                  >
                    <span>{continuationCopy?.cta}</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px">
                      <ArrowUpRight size={14} weight="bold" />
                    </span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  課程大綱
                </p>
                <p className="mt-1 truncate text-sm font-medium text-text-primary">
                  {course.title}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  共 {flatPreviews.length} 堂免費試看
                </p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
                {outline.map((entry) => (
                  <div key={entry.chapter.id} className="mb-2 last:mb-0">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      {entry.chapter.title}
                    </p>
                    <ul>
                      {entry.lessons.map((l) => {
                        if (l.isPreview) {
                          const isCurrent = l.id === lesson.id;
                          return (
                            <li key={l.id}>
                              <Link prefetch={false}
                                href={`/preview/${courseId}/${l.id}`}
                                aria-current={isCurrent ? "page" : undefined}
                                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                                  isCurrent
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-text-secondary hover:bg-surface-muted"
                                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.995]`}
                              >
                                <Eye
                                  size={14}
                                  weight={isCurrent ? "fill" : "regular"}
                                  className="mt-0.5 shrink-0 text-blue-500"
                                />
                                <span className="flex-1 truncate">
                                  {l.title}
                                </span>
                              </Link>
                            </li>
                          );
                        }
                        return (
                          <li
                            key={l.id}
                            className="flex items-start gap-2 px-2 py-1.5 text-sm text-text-muted"
                          >
                            <Lock
                              size={14}
                              className="mt-0.5 shrink-0 text-text-muted"
                            />
                            <span className="flex-1 truncate">{l.title}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

          </aside>
        </div>
      </div>
    </article>
  );
}
