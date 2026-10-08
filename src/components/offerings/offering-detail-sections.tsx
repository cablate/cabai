"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  VideoCamera,
  Article,
  FilePdf,
  DownloadSimple,
  Eye,
  Clock,
  BookOpen,
  CheckCircle,
  Package,
  Microphone,
  CalendarBlank,
  ArrowsClockwise,
  MapPin,
  Ticket,
  Wrench,
  ListChecks,
  Crown,
  Star,
  FileArrowDown,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { OfferingType } from "@/lib/validations/plan-presentations";
import { getPersistentAccessLabel } from "@/lib/public-offering-copy";
import type {
  CourseMetadata,
  LectureMetadata,
  ServiceMetadata,
  MembershipMetadata,
  OfflineEventMetadata,
} from "@/lib/validations/plan-presentations";

// ─── Syllabus types (from page.tsx server) ───

interface SyllabusLesson {
  id: string;
  title: string;
  type: string;
  duration: number | null;
  isPreview: boolean;
}

interface SyllabusChapter {
  id: string;
  title: string;
  defaultExpanded: boolean;
  lessons: SyllabusLesson[];
}

interface CourseSyllabus {
  courseId: string;
  courseTitle: string;
  chapters: SyllabusChapter[];
  totalLessons: number;
  totalDurationSeconds: number;
  previewCount: number;
}

interface OfferingDetailSectionsProps {
  offeringType: OfferingType;
  metadata: Record<string, unknown> | null;
  syllabus?: CourseSyllabus | null;
  isFreeAccess?: boolean;
}

const lessonTypeIcons: Record<string, typeof VideoCamera> = {
  video: VideoCamera,
  text: Article,
  pdf: FilePdf,
  download: DownloadSimple,
};

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Expandable chapter ───

function ChapterAccordion({
  chapter,
  index,
  defaultOpen,
  courseId,
}: {
  chapter: SyllabusChapter;
  index: number;
  defaultOpen: boolean;
  courseId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`syllabus-chapter-${chapter.id}`}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-[background-color,transform] hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.995]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-zinc-900">
          {chapter.title}
        </span>
        <span className="text-xs text-zinc-400">
          {chapter.lessons.length} 堂
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className={cn(
            "shrink-0 text-zinc-400 transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open && (
        <div id={`syllabus-chapter-${chapter.id}`} className="pb-2">
          {chapter.lessons.map((lesson) => {
            const Icon = lessonTypeIcons[lesson.type] || Article;
            const previewHref =
              lesson.isPreview && courseId
                ? `/preview/${courseId}/${lesson.id}`
                : null;

            const inner = (
              <>
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0",
                    previewHref ? "text-blue-500" : "text-zinc-400"
                  )}
                />
                <span
                  className={cn(
                    "flex-1 text-sm truncate",
                    previewHref
                      ? "text-zinc-800 group-hover:text-blue-600"
                      : "text-zinc-600"
                  )}
                >
                  {lesson.title}
                </span>
                {lesson.isPreview && (
                  <span className="flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                    <Eye size={12} />
                    免費試看
                  </span>
                )}
                {lesson.duration != null && lesson.duration > 0 && (
                  <span className="text-xs text-zinc-400 font-mono tabular-nums">
                    {formatDuration(lesson.duration)}
                  </span>
                )}
              </>
            );

            return previewHref ? (
              <Link prefetch={false}
                key={lesson.id}
                href={previewHref}
                className="group flex items-center gap-3 px-5 py-2.5 pl-14 transition-[background-color,color] hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={lesson.id}
                className="flex items-center gap-3 px-5 py-2.5 pl-14"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reusable "你會得到什麼" items ───

function YouGetGrid({ items }: { items: Array<{ icon: typeof VideoCamera; text: string }> }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-4 text-xl font-semibold text-zinc-900">
        你會得到什麼
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3"
          >
            <item.icon size={20} weight="duotone" className="shrink-0 text-emerald-600" />
            <span className="text-sm text-zinc-700">{item.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Type-specific content sections for universal detail page
 */
export function OfferingDetailSections({
  offeringType,
  metadata,
  syllabus,
  isFreeAccess = false,
}: OfferingDetailSectionsProps) {
  if (!metadata) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
        <p className="text-sm text-text-muted">
          此項目的詳細資訊正在準備中，請稍後再訪問。
        </p>
      </div>
    );
  }

  switch (offeringType) {
    case "course": {
      const meta = metadata as CourseMetadata;
      const hasSyllabus = syllabus && syllabus.chapters.length > 0;
      const totalHours = hasSyllabus
        ? Math.round((syllabus.totalDurationSeconds / 3600) * 10) / 10
        : meta.estimatedHours || 0;
      const chapterCount = hasSyllabus ? syllabus.chapters.length : (meta.chapterCount || 0);
      const lessonCount = hasSyllabus ? syllabus.totalLessons : (meta.lessonCount || 0);
      const previewCount = hasSyllabus ? syllabus.previewCount : (meta.freeLessonCount || 0);

      return (
        <div className="space-y-8">
          {/* 你會得到什麼 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-zinc-900">
              你會得到什麼
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {chapterCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <BookOpen size={20} weight="duotone" className="shrink-0 text-emerald-600" />
                  <span className="text-sm text-zinc-700">{chapterCount} 個章節的完整課程</span>
                </div>
              )}
              {lessonCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <VideoCamera size={20} weight="duotone" className="shrink-0 text-emerald-600" />
                  <span className="text-sm text-zinc-700">{lessonCount} 堂課程內容</span>
                </div>
              )}
              {totalHours > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <Clock size={20} weight="duotone" className="shrink-0 text-emerald-600" />
                  <span className="text-sm text-zinc-700">約 {totalHours} 小時學習時數</span>
                </div>
              )}
              {previewCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <Eye size={20} weight="duotone" className="shrink-0 text-blue-600" />
                  <span className="text-sm text-zinc-700">{previewCount} 堂免費試看</span>
                </div>
              )}
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                <CheckCircle size={20} weight="duotone" className="shrink-0 text-emerald-600" />
                <span className="text-sm text-zinc-700">
                  {getPersistentAccessLabel(isFreeAccess)}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                <Package size={20} weight="duotone" className="shrink-0 text-emerald-600" />
                <span className="text-sm text-zinc-700">會員中心集中管理</span>
              </div>
            </div>
          </section>

          {/* 課程大綱 — from DB */}
          {hasSyllabus && (() => {
            const anyExplicit = syllabus.chapters.some((c) => c.defaultExpanded);
            return (
            <section>
              <h2 className="mb-4 text-xl font-semibold text-zinc-900">
                課程大綱
              </h2>
              <div
                className="overflow-hidden rounded-lg border border-zinc-200"
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: `auto ${syllabus.chapters.length * 60}px`,
                }}
              >
                {syllabus.chapters.map((chapter, i) => (
                  <ChapterAccordion
                    key={chapter.id}
                    chapter={chapter}
                    index={i}
                    defaultOpen={anyExplicit ? chapter.defaultExpanded : i === 0}
                    courseId={syllabus.courseId}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                共 {syllabus.chapters.length} 章 · {syllabus.totalLessons} 堂
                {syllabus.totalDurationSeconds > 0 &&
                  ` · 約 ${totalHours} 小時`}
              </p>
            </section>
            );
          })()}

          {/* Free Preview highlight */}
          {previewCount > 0 && (
            <section>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  本課程提供 {previewCount} 堂免費試看，點擊大綱中標示「免費試看」的課即可直接觀看，不需登入。
                </p>
              </div>
            </section>
          )}
        </div>
      );
    }

    case "lecture": {
      const meta = metadata as LectureMetadata;
      const eventDate = new Date(meta.eventDate);
      const formattedDate = eventDate.toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const lectureYouGet = [
        { icon: Microphone, text: `${meta.speaker || "專業講者"} 主講` },
        { icon: CalendarBlank, text: `${formattedDate} 線上講座` },
        ...(meta.durationMinutes ? [{ icon: Clock, text: `約 ${Math.floor(meta.durationMinutes / 60)} 小時 ${meta.durationMinutes % 60} 分鐘` }] : []),
        ...(meta.hasReplay ? [{ icon: ArrowsClockwise, text: "提供回放，錯過可補看" }] : []),
        { icon: CheckCircle, text: "購買後會員中心取得連結" },
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={lectureYouGet} />

          {/* Lecture Info */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              講座資訊
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-muted">講者</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {meta.speaker}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">日期與時間</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {formattedDate} {meta.eventTime}
                  </p>
                </div>
                {meta.durationMinutes && (
                  <div>
                    <p className="text-xs text-text-muted">講座時長</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {Math.floor(meta.durationMinutes / 60)} 小時{" "}
                      {meta.durationMinutes % 60} 分鐘
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Speaker Bio */}
          {meta.speakerBio && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                講者介紹
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <p className="text-sm leading-relaxed text-text-secondary">
                  {meta.speakerBio}
                </p>
              </div>
            </section>
          )}

          {/* Agenda */}
          {meta.agenda && meta.agenda.length > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                議程
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <div className="space-y-3">
                  {meta.agenda.map((item, index) => (
                    <div key={index} className="flex gap-4">
                      <span className="flex-shrink-0 font-mono text-sm font-semibold text-text-muted">
                        {item.time}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {item.topic}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Replay Info */}
          {meta.hasReplay && (
            <section>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  📹 此講座提供回放，錯過直播亦可按時間查看錄製版本。
                </p>
              </div>
            </section>
          )}
        </div>
      );
    }

    case "offline_event": {
      const meta = metadata as OfflineEventMetadata;
      const eventDate = new Date(meta.eventDate);
      const formattedDate = eventDate.toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const eventYouGet = [
        { icon: Ticket, text: "電子票券（會員中心取得）" },
        { icon: CalendarBlank, text: `${formattedDate} 實體活動` },
        { icon: MapPin, text: meta.venue || "活動場地" },
        ...(meta.capacity ? [{ icon: Eye, text: `限額 ${meta.capacity} 人` }] : []),
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={eventYouGet} />

          {/* Event Details */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              活動資訊
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-muted">日期與時間</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {formattedDate} {meta.eventTime}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">活動地點</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {meta.venue}
                  </p>
                  {meta.address && (
                    <p className="mt-1 text-sm text-text-secondary">
                      {meta.address}
                    </p>
                  )}
                </div>
                {meta.capacity && (
                  <div>
                    <p className="text-xs text-text-muted">場地容納人數</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {meta.capacity} 人
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Practical Info */}
          {(meta.parkingInfo || meta.dressCode || meta.admissionNotes) && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                實用資訊
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <div className="space-y-4">
                  {meta.dressCode && (
                    <div>
                      <p className="text-xs font-medium text-text-muted uppercase">
                        服裝建議
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {meta.dressCode}
                      </p>
                    </div>
                  )}
                  {meta.parkingInfo && (
                    <div>
                      <p className="text-xs font-medium text-text-muted uppercase">
                        停車資訊
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {meta.parkingInfo}
                      </p>
                    </div>
                  )}
                  {meta.admissionNotes && (
                    <div>
                      <p className="text-xs font-medium text-text-muted uppercase">
                        入場說明
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {meta.admissionNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Ticket Tiers */}
          {meta.ticketTiers && meta.ticketTiers.length > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                票券分級
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <div className="space-y-3">
                  {meta.ticketTiers.map((tier, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded bg-surface px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-text-primary">
                          {tier.name}
                        </p>
                        {tier.description && (
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {tier.description}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-text-muted">
                        {tier.quantity} 位
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      );
    }

    case "service": {
      const meta = metadata as ServiceMetadata;

      const serviceYouGet = [
        { icon: Wrench, text: meta.serviceScope || "專業服務" },
        ...(meta.expectedTimelineWeeks ? [{ icon: Clock, text: `約 ${meta.expectedTimelineWeeks} 週完成` }] : []),
        ...(meta.deliverySteps ? [{ icon: ListChecks, text: `${meta.deliverySteps.length} 個交付步驟` }] : []),
        { icon: CheckCircle, text: "會員中心查看後續安排" },
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={serviceYouGet} />

          {/* Service Scope */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              服務內容
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <p className="text-sm leading-relaxed text-text-secondary">
                {meta.serviceScope}
              </p>
            </div>
          </section>

          {/* Delivery Steps / Flow */}
          {meta.deliverySteps && meta.deliverySteps.length > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                服務流程
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <div className="space-y-4">
                  {meta.deliverySteps.map((step) => (
                    <div key={step.step} className="flex gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-text-primary">
                          {step.title}
                        </h4>
                        {step.description && (
                          <p className="mt-1 text-sm text-text-secondary">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          {meta.expectedTimelineWeeks && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                預計時程
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <p className="text-lg font-semibold text-text-primary">
                  約 {meta.expectedTimelineWeeks} 週
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  完成購買後，請前往會員中心查看目前的服務資訊與後續安排。
                </p>
              </div>
            </section>
          )}

          {/* Required Inputs */}
          {meta.requiredInputs && meta.requiredInputs.length > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                您需要準備的資料
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <ul className="space-y-2">
                  {meta.requiredInputs.map((input, index) => (
                    <li key={index} className="flex gap-3 text-sm text-text-secondary">
                      <span className="flex-shrink-0">✓</span>
                      <span>{input}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Support Channels */}
          {meta.supportChannels && meta.supportChannels.length > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                支援管道
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <div className="flex flex-wrap gap-2">
                  {meta.supportChannels.map((channel) => (
                    <span
                      key={channel}
                      className="inline-block rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-secondary"
                    >
                      {channel === "email" && "📧 Email"}
                      {channel === "slack" && "💬 Slack"}
                      {channel === "discord" && "🎮 Discord"}
                      {channel === "phone" && "☎️ Phone"}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      );
    }

    case "membership": {
      const meta = metadata as MembershipMetadata;

      const frequencyLabels: Record<string, string> = {
        daily: "每日",
        weekly: "每週",
        monthly: "每月",
        quarterly: "每季",
      };

      const memberYouGet = [
        { icon: Crown, text: `${meta.benefits?.length || 0} 項會員權益` },
        { icon: ArrowsClockwise, text: `${frequencyLabels[meta.updateFrequency] || meta.updateFrequency}更新內容` },
        ...(meta.exclusiveChannelAccess ? [{ icon: Star, text: "專屬會員頻道" }] : []),
        ...(meta.communityEvents ? [{ icon: CalendarBlank, text: "定期會員活動" }] : []),
        { icon: CheckCircle, text: "訂閱期間無限存取" },
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={memberYouGet} />

          {/* Benefits */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              會員權益
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <ul className="space-y-3">
                {meta.benefits.map((benefit, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex-shrink-0 text-emerald-600">✓</span>
                    <div>
                      <p className="font-medium text-text-primary">
                        {benefit.title}
                      </p>
                      {benefit.description && (
                        <p className="mt-0.5 text-sm text-text-secondary">
                          {benefit.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Update Frequency */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              內容更新
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <p className="text-lg font-semibold text-text-primary">
                {frequencyLabels[meta.updateFrequency] || meta.updateFrequency}
                更新
              </p>
              {meta.monthlyContentCount && (
                <p className="mt-2 text-sm text-text-secondary">
                  每月平均新增 {meta.monthlyContentCount} 份資料
                </p>
              )}
            </div>
          </section>

          {/* Exclusive Access */}
          {meta.exclusiveChannelAccess && (
            <section>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <p className="text-sm text-purple-900">
                  💬 獨享會員專屬頻道，與其他成員交流和討論。
                </p>
              </div>
            </section>
          )}

          {/* Community Events */}
          {meta.communityEvents && (
            <section>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  🎉 定期舉辦會員專屬活動和工作坊。
                </p>
              </div>
            </section>
          )}
        </div>
      );
    }

    case "free_event": {
      const meta = metadata as Record<string, unknown>;
      const eventDate = typeof meta.eventDate === 'string' ? new Date(meta.eventDate) : new Date();
      const formattedDate = eventDate.toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const freeEventYouGet = [
        { icon: CheckCircle, text: "完全免費，無需付費" },
        { icon: CalendarBlank, text: `${formattedDate} 活動` },
        ...(typeof meta.capacity === 'number' ? [{ icon: Eye, text: `限額 ${meta.capacity} 人` }] : []),
        { icon: Package, text: "報名後會員中心取得資訊" },
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={freeEventYouGet} />

          {/* Event Details */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              活動資訊
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-muted">活動日期</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {formattedDate}
                  </p>
                </div>
                {(typeof meta.capacity === 'number' || typeof meta.capacity === 'string') && (
                  <div>
                    <p className="text-xs text-text-muted">人數限制</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {meta.capacity} 人
                    </p>
                  </div>
                )}
                {typeof meta.targetAudience === 'string' && (
                  <div>
                    <p className="text-xs text-text-muted">目標族群</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {meta.targetAudience}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Registration Notes */}
          {typeof meta.registrationNotes === 'string' && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                報名須知
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <p className="text-sm text-text-secondary">{meta.registrationNotes}</p>
              </div>
            </section>
          )}

          {/* Free Badge */}
          <section>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                ✓ 此活動完全免費，無需付費即可參加
              </p>
            </div>
          </section>
        </div>
      );
    }

    case "download": {
      const meta = metadata as Record<string, unknown>;

      const licenseLabels: Record<string, string> = {
        personal: "個人使用",
        commercial: "商業使用",
        educational: "教育使用",
      };

      const downloadYouGet = [
        { icon: FileArrowDown, text: "會員中心查看可用檔案" },
        ...(typeof meta.fileFormat === 'string' ? [{ icon: FilePdf, text: `${meta.fileFormat} 格式` }] : []),
        ...(typeof meta.numberOfFiles === 'number' ? [{ icon: Package, text: `${meta.numberOfFiles} 個檔案` }] : []),
        { icon: CheckCircle, text: "依目前權益取得內容" },
      ];

      return (
        <div className="space-y-8">
          <YouGetGrid items={downloadYouGet} />

          {/* File Info */}
          <section>
            <h3 className="mb-4 text-xl font-semibold text-text-primary">
              下載資訊
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
              <div className="grid gap-4 md:grid-cols-2">
                {typeof meta.fileFormat === 'string' && (
                  <div>
                    <p className="text-xs text-text-muted">檔案格式</p>
                    <p className="mt-1 font-mono text-base font-semibold text-text-primary">
                      {meta.fileFormat}
                    </p>
                  </div>
                )}
                {typeof meta.fileSize === 'string' && (
                  <div>
                    <p className="text-xs text-text-muted">檔案大小</p>
                    <p className="mt-1 font-mono text-base font-semibold text-text-primary">
                      {meta.fileSize}
                    </p>
                  </div>
                )}
                {(typeof meta.numberOfFiles === 'number' || typeof meta.numberOfFiles === 'string') && (
                  <div>
                    <p className="text-xs text-text-muted">檔案數量</p>
                    <p className="mt-1 font-mono text-base font-semibold text-text-primary">
                      {meta.numberOfFiles} 個
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* License Info */}
          {typeof meta.license === 'string' && (
            <section>
              <h3 className="mb-4 text-xl font-semibold text-text-primary">
                使用授權
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6">
                <p className="text-sm text-text-secondary">
                  {licenseLabels[meta.license] || meta.license}
                </p>
              </div>
            </section>
          )}
        </div>
      );
    }

    default: {
      const _exhaustive: never = offeringType;
      return _exhaustive;
    }
  }
}
