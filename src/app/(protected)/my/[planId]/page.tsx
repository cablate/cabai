import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePlanByIdOrSlug } from "@/lib/plans-local";
import { planPath } from "@/lib/plan-url";
import { checkPlanAccess } from "@/lib/access";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import { getPlanWithPresentation } from "@/lib/plan-presentations";
import { db } from "@/lib/db";
import { planContents } from "@/lib/db/schema";
import { and, eq, asc, isNull } from "drizzle-orm";
import { ContentRenderer } from "@/components/content-renderer";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import {
  PlayCircle,
  FilePdf,
  FileText,
  DownloadSimple,
  ArrowRight,
  BookOpen,
  Gear,
} from "@phosphor-icons/react/dist/ssr";

const TYPE_ICONS: Record<string, typeof PlayCircle> = {
  video: PlayCircle,
  pdf: FilePdf,
  text: FileText,
  download: DownloadSimple,
};

const TYPE_LABELS: Record<string, string> = {
  video: "影片",
  pdf: "PDF",
  text: "文字",
  download: "下載",
};

export default async function MyPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { planId: idOrSlug } = await params;

  const plan = await resolvePlanByIdOrSlug(idOrSlug);
  if (!plan) notFound();
  const planId = plan.id;

  // Access check (admin bypass is inside checkPlanAccess)
  const access = await checkPlanAccess(session.user.id, planId, session.user.email, session.user.role);
  if (!access.hasAccess) {
    redirect(planPath(plan, "product"));
  }

  const overview = await getDeliveryOverviewForPlan(planId, session.user.id);

  // Get plan with presentation
  let presentation = null;
  try {
    const result = await getPlanWithPresentation(planId);
    presentation = result.presentation;
  } catch {
    // Presentation not found or error - fall back to default view
  }

  // Get full plan contents for rendering
  const contents = await db
    .select()
    .from(planContents)
    .where(and(eq(planContents.planId, planId), isNull(planContents.deletedAt)))
    .orderBy(asc(planContents.sortOrder));

  const offeringType = presentation?.offeringType || "course";
  const title = presentation?.title || plan.name;
  const description = presentation?.subtitle || plan.description;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link prefetch={false} href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700">
        &larr; 返回會員中心
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{title}</h1>
      {description && (
        <p className="mt-2 text-zinc-500">{description}</p>
      )}

      <div className="mt-8 space-y-8">
        {/* Pre-sale: course exists but is draft */}
        {offeringType === "course" && overview.courses.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
            <h2 className="text-lg font-semibold text-amber-900">即將推出</h2>
            <p className="mt-2 text-sm text-amber-800">
              課程內容正在準備中，完成後會在這裡開放。感謝你的耐心等待。
            </p>
          </div>
        )}

        {/* Type-specific content rendering */}
        {offeringType === "course" || (offeringType === "download" && overview.courses.length > 0) ? (
          <>
            {/* Courses section (existing) */}
            {overview.courses.length > 0 && (
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase text-zinc-400">
                  <BookOpen size={16} />
                  課程
                </h2>
                <div className="space-y-3">
                  {overview.courses.map((course) => {
                    const pct = course.lessonCount > 0
                      ? Math.round((course.completedLessonCount / course.lessonCount) * 100)
                      : 0;
                    return (
                      <Link prefetch={false}
                        key={course.id}
                        href={`/courses/${course.id}`}
                        className="flex items-center justify-between rounded-xl border border-zinc-200/60 bg-white p-5 transition-colors hover:bg-zinc-50"
                      >
                        <div className="flex-1">
                          <h3 className="font-medium text-zinc-900">{course.title}</h3>
                          {course.description && (
                            <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{course.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                            <span>{course.lessonCount} 堂課</span>
                            {course.completedLessonCount > 0 && (
                              <span className="text-emerald-600">已完成 {pct}%</span>
                            )}
                          </div>
                          {course.lessonCount > 0 && (
                            <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <ArrowRight size={20} className="ml-4 text-zinc-300" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : null}

        {/* Lecture/Event specific content */}
        {(offeringType === "lecture" || offeringType === "free_event" || offeringType === "offline_event") && presentation ? (
          <section className="rounded-xl border border-zinc-200/60 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">活動資訊</h2>
            {(() => {
              const metadata = presentation.metadataJson as Record<string, unknown> | null;
              const eventDate = metadata?.eventDate && typeof metadata.eventDate === 'string' ? new Date(metadata.eventDate) : null;
              const eventTime = (typeof metadata?.eventTime === 'string' ? metadata.eventTime : "") || "";

              // Google Calendar link
              const calendarUrl = eventDate
                ? `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${eventDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z/${eventDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z&details=${encodeURIComponent(description || "")}`
                : null;

              return (
                <div className="space-y-3 text-sm text-zinc-600">
                  {eventDate && (
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium text-zinc-900">日期與時間</span>
                        <p className="mt-1">
                          {eventDate.toLocaleDateString("zh-TW", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                          {eventTime && ` · ${eventTime}`}
                        </p>
                      </div>
                      {calendarUrl && (
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                        >
                          加入行事曆
                        </a>
                      )}
                    </div>
                  )}
                  {offeringType === "offline_event" && metadata && typeof metadata.venue === 'string' && (
                    <div>
                      <span className="font-medium text-zinc-900">地點</span>
                      <p className="mt-1">{metadata.venue}</p>
                      {typeof metadata.address === 'string' && <p className="text-xs text-zinc-500">{metadata.address}</p>}
                    </div>
                  )}
                  {metadata && typeof metadata.speakerName === 'string' && (
                    <div>
                      <span className="font-medium text-zinc-900">講者</span>
                      <p className="mt-1">{metadata.speakerName}</p>
                    </div>
                  )}
                  {metadata && Array.isArray(metadata.agenda) && (
                    <div>
                      <span className="font-medium text-zinc-900">議程</span>
                      <ul className="mt-2 space-y-1 text-xs">
                        {(metadata.agenda as Array<Record<string, unknown>>).map((item: Record<string, unknown>, idx: number) => (
                          <li key={idx} className="text-zinc-600">
                            <strong>{item.time as string}</strong> · {item.topic as string}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        ) : null}

        {/* Service specific content */}
        {offeringType === "service" && presentation ? (
          <section className="rounded-xl border border-zinc-200/60 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">服務進度</h2>
            {(() => {
              const metadata = presentation.metadataJson as Record<string, unknown> | null;
              return (
                <div className="space-y-4">
                  {metadata && typeof metadata.serviceScope === 'string' && (
                    <div>
                      <span className="font-medium text-zinc-900">服務範圍</span>
                      <p className="mt-2 text-sm text-zinc-600">{metadata.serviceScope}</p>
                    </div>
                  )}
                  {metadata && typeof metadata.expectedTimelineWeeks === 'number' && (
                    <div>
                      <span className="font-medium text-zinc-900">預計交期</span>
                      <p className="mt-1 text-sm text-zinc-600">{metadata.expectedTimelineWeeks} 週</p>
                    </div>
                  )}
                  {metadata && Array.isArray(metadata.deliverySteps) && (
                    <div>
                      <span className="font-medium text-zinc-900 block mb-3">服務流程</span>
                      <div className="relative ml-3 border-l-2 border-zinc-200 pl-6">
                        {(metadata.deliverySteps as Array<Record<string, unknown>>).map((step: Record<string, unknown>, idx: number) => (
                          <div key={step.step as React.Key} className="relative pb-6 last:pb-0">
                            <div className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-200 bg-white text-xs font-semibold text-zinc-600">
                              {idx + 1}
                            </div>
                            <p className="font-medium text-sm text-zinc-900">{step.title as string}</p>
                            {typeof step.description === 'string' && (
                              <p className="text-xs text-zinc-500 mt-1">{step.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {metadata && Array.isArray(metadata.supportChannels) && (
                    <div>
                      <span className="font-medium text-zinc-900 block mb-2">支援管道</span>
                      <p className="text-sm text-zinc-600">
                        {(metadata.supportChannels as string[]).join(" · ")}
                      </p>
                    </div>
                  )}
                  {/* Contact CTA */}
                  <div className="pt-4 border-t border-zinc-100">
                    <a
                      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`服務諮詢：${title}`)}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                    >
                      聯繫支援
                    </a>
                    <p className="mt-2 text-xs text-zinc-400">
                      有任何問題歡迎來信，我們會盡快回覆
                    </p>
                  </div>
                </div>
              );
            })()}
          </section>
        ) : null}

        {/* Membership specific content */}
        {offeringType === "membership" && presentation ? (
          <section className="rounded-xl border border-zinc-200/60 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">會員權益</h2>
            {(() => {
              const metadata = presentation.metadataJson as Record<string, unknown> | null;
              return (
                <div className="space-y-4">
                  {metadata && Array.isArray(metadata.benefits) && (
                    <div>
                      <span className="font-medium text-zinc-900 block mb-3">享受的權益</span>
                      <ul className="space-y-2">
                        {(metadata.benefits as Array<Record<string, unknown>>).map((benefit: Record<string, unknown>, idx: number) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <div>
                              <p className="font-medium text-sm text-zinc-900">{benefit.title as string}</p>
                              {typeof benefit.description === 'string' && (
                                <p className="text-xs text-zinc-500 mt-0.5">{benefit.description}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {metadata && typeof metadata.updateFrequency === 'string' && (
                    <div>
                      <span className="font-medium text-zinc-900">更新頻率</span>
                      <p className="mt-1 text-sm text-zinc-600">
                        {
                          ({
                            daily: "每日更新",
                            weekly: "每週更新",
                            monthly: "每月更新",
                            quarterly: "每季更新",
                          } as Record<string, string>)[metadata.updateFrequency] || metadata.updateFrequency
                        }
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        ) : null}

        {/* Plan contents section */}
        {contents.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase text-zinc-400">
              <FileText size={16} />
              資料與內容
            </h2>
            <div className="space-y-3">
              {contents.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? FileText;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-zinc-200/60 bg-white p-5"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} className="text-zinc-400" />
                      <h3 className="font-medium text-zinc-900">{item.title}</h3>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                    </div>
                    <div className="mt-3">
                      <ContentRenderer type={item.type} content={item.content} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Services section */}
        {overview.services.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase text-zinc-400">
              <Gear size={16} />
              外部服務
            </h2>
            <div className="space-y-2">
              {overview.services.map((svc) => (
                <div
                  key={svc.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200/60 bg-white px-5 py-3"
                >
                  <span className="text-sm text-zinc-700">{svc.serviceName}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      svc.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {svc.isActive ? "已啟用" : "未啟用"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!overview.hasDelivery && contents.length === 0 && (
          <div className="rounded-xl border border-zinc-200/60 bg-white px-6 py-12 text-center">
            <p className="text-zinc-500">此商品尚未設定交付內容。</p>
          </div>
        )}
      </div>
    </div>
  );
}
