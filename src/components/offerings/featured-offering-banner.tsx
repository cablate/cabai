"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { formatPrice } from "@/lib/utils";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { planPath } from "@/lib/plan-url";

interface CourseStats {
  chapterCount: number;
  lessonCount: number;
  totalDurationHours: number;
  previewCount: number;
}

interface BannerItem {
  plan: Plan;
  presentation: PlanPresentation;
  courseStats?: CourseStats;
  alreadyPurchased?: boolean;
}

interface FeaturedOfferingBannerProps {
  items: BannerItem[];
}

// ─── Type labels ───

const typeLabels: Record<string, string> = {
  course: "課程",
  lecture: "講座",
  free_event: "免費活動",
  offline_event: "實體活動",
  service: "顧問服務",
  membership: "訂閱會員",
  download: "下載資源",
};

function mapBillingPeriod(period: string): string {
  switch (period) {
    case "monthly":
      return "/ 月";
    case "yearly":
      return "/ 年";
    case "one-time":
      return "一次付費";
    default:
      return period;
  }
}

// ─── Stats bar ───

interface StatItem {
  label: string;
  value: string;
}

function buildStats(item: BannerItem): StatItem[] {
  const stats: StatItem[] = [];
  const { presentation, courseStats } = item;
  const meta = presentation.metadataJson as Record<string, unknown> | null;

  switch (presentation.offeringType) {
    case "course": {
      if (courseStats) {
        if (courseStats.chapterCount > 0)
          stats.push({ label: "章節", value: `${courseStats.chapterCount} 章` });
        if (courseStats.lessonCount > 0)
          stats.push({ label: "堂數", value: `${courseStats.lessonCount} 堂` });
        if (courseStats.totalDurationHours > 0)
          stats.push({
            label: "時長",
            value: `~${courseStats.totalDurationHours} 小時`,
          });
        if (courseStats.previewCount > 0)
          stats.push({
            label: "免費試看",
            value: `${courseStats.previewCount} 堂`,
          });
      }
      break;
    }
    case "lecture": {
      if (meta?.speaker)
        stats.push({ label: "講者", value: meta.speaker as string });
      if (meta?.eventDate)
        stats.push({
          label: "日期",
          value: formatDate(meta.eventDate as string),
        });
      if (meta?.durationMinutes)
        stats.push({
          label: "時長",
          value: `${meta.durationMinutes} 分鐘`,
        });
      if (meta?.hasReplay != null)
        stats.push({
          label: "回放",
          value: meta.hasReplay ? "提供" : "僅直播",
        });
      break;
    }
    case "free_event": {
      stats.push({ label: "費用", value: "免費" });
      if (meta?.eventDate)
        stats.push({
          label: "日期",
          value: formatDate(meta.eventDate as string),
        });
      if (meta?.capacity)
        stats.push({ label: "名額", value: `${meta.capacity} 人` });
      if (meta?.targetAudience)
        stats.push({ label: "對象", value: meta.targetAudience as string });
      break;
    }
    case "offline_event": {
      if (meta?.venue)
        stats.push({ label: "地點", value: meta.venue as string });
      if (meta?.eventDate)
        stats.push({
          label: "日期",
          value: formatDate(meta.eventDate as string),
        });
      if (meta?.capacity)
        stats.push({ label: "名額", value: `${meta.capacity} 位` });
      if (meta?.admissionNotes)
        stats.push({ label: "入場", value: meta.admissionNotes as string });
      break;
    }
    case "service": {
      if (meta?.serviceScope)
        stats.push({ label: "範圍", value: meta.serviceScope as string });
      if (meta?.expectedTimelineWeeks)
        stats.push({
          label: "時程",
          value: `約 ${meta.expectedTimelineWeeks} 週`,
        });
      const steps = meta?.deliverySteps as string[] | undefined;
      if (steps && steps.length > 0)
        stats.push({ label: "交付", value: `${steps.length} 項` });
      break;
    }
    case "membership": {
      const benefits = meta?.benefits as string[] | undefined;
      if (benefits && benefits.length > 0)
        stats.push({ label: "權益", value: `${benefits.length} 項` });
      if (meta?.updateFrequency) {
        const freqMap: Record<string, string> = {
          daily: "每日",
          weekly: "每週",
          monthly: "每月",
          quarterly: "每季",
        };
        stats.push({
          label: "更新",
          value: freqMap[meta.updateFrequency as string] || (meta.updateFrequency as string),
        });
      }
      break;
    }
    case "download": {
      if (meta?.fileFormat)
        stats.push({ label: "格式", value: meta.fileFormat as string });
      if (meta?.fileSize)
        stats.push({ label: "大小", value: meta.fileSize as string });
      if (meta?.numberOfFiles)
        stats.push({ label: "檔案", value: `${meta.numberOfFiles} 個` });
      break;
    }
  }

  return stats;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("zh-TW", {
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ─── Stats Bar Component ───

function StatsBar({ stats }: { stats: StatItem[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-px overflow-hidden rounded-lg border border-white/12 bg-white/12">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-w-0 flex-1 items-center gap-2 bg-ink/60 px-4 py-3 backdrop-blur"
        >
          <span className="text-xs text-white/50">{stat.label}</span>
          <span className="truncate text-sm font-medium text-white">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Single Banner Slide ───

function BannerSlide({ item }: { item: BannerItem }) {
  const { plan, presentation, alreadyPurchased = false } = item;
  const typeLabel = typeLabels[presentation.offeringType] || "";
  const billingLabel = mapBillingPeriod(plan.billingPeriod);
  const stats = useMemo(() => buildStats(item), [item]);

  // Banner 只負責導航：購買流程交給詳情頁右側 CTA
  const isInactive = plan.status !== "active";
  const ctaLabel = alreadyPurchased
    ? "進入內容"
    : isInactive
      ? "已停售"
      : "了解詳情";
  const ctaHref = alreadyPurchased ? planPath(plan, "my") : planPath(plan, "product");
  const ctaDisabled = isInactive && !alreadyPurchased;

  return (
    <div className="relative min-h-[28rem] overflow-hidden lg:min-h-[32rem]">
      {/* Background: always dark, with optional image */}
      <div className="absolute inset-0 bg-ink" />
      {presentation.bannerImage && (
        <div className="absolute inset-0">
          <Image
            src={presentation.bannerImage}
            alt={presentation.title}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,10,0.94)_0%,rgba(13,12,10,0.82)_40%,rgba(13,12,10,0.5)_75%,rgba(13,12,10,0.3)_100%)]" />
        </div>
      )}
      {/* Bottom fade for smooth transition to next section */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/80 to-transparent" />

      {/* Content */}
      <div className="relative mx-auto flex min-h-[28rem] max-w-7xl flex-col justify-center px-6 py-16 md:px-8 lg:min-h-[32rem] lg:max-w-[60%] lg:py-20">
        {/* Type badge */}
        <span className="inline-flex w-fit items-center rounded-md border border-white/16 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
          {typeLabel}
        </span>

        {/* Title */}
        <h2 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-4xl lg:text-5xl lg:leading-[1.1]">
          {presentation.title}
        </h2>

        {/* Subtitle */}
        {presentation.subtitle && (
          <p className="mt-3 max-w-[55ch] text-lg leading-7 text-white/70 md:text-xl">
            {presentation.subtitle}
          </p>
        )}

        {/* Stats bar */}
        {stats.length > 0 && (
          <div className="mt-8 max-w-xl">
            <StatsBar stats={stats} />
          </div>
        )}

        {/* Price + CTA row */}
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-white">
              {formatPrice(plan.amount)}
            </span>
            <span className="text-sm text-white/50">{billingLabel}</span>
          </div>

          {ctaDisabled ? (
            <span className="inline-flex items-center gap-2 rounded-md bg-white/20 px-6 py-3 text-sm font-semibold text-white/60">
              {ctaLabel}
            </span>
          ) : (
            <Link prefetch={false}
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-ink transition-[background-color,transform] duration-300 hover:bg-amber-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-soft active:scale-[0.98]"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function FeaturedOfferingBanner({
  items,
}: FeaturedOfferingBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!items || items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) =>
        prev === items.length - 1 ? 0 : prev + 1
      );
    }, 6000);
    return () => clearInterval(interval);
  }, [items]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];
  if (!currentItem) return null;

  // Single item
  if (items.length === 1) {
    return (
      <section>
        <BannerSlide item={currentItem} />
      </section>
    );
  }

  // Carousel
  return (
    <section className="relative">
      <BannerSlide item={currentItem} />

      {/* Carousel controls */}
      <div className="absolute inset-x-6 bottom-6 z-10 flex items-center justify-between md:inset-x-8 md:bottom-8">
        <button
          type="button"
          onClick={() =>
            setCurrentIndex((prev) =>
              prev === 0 ? items.length - 1 : prev - 1
            )
          }
          className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 p-2 text-white backdrop-blur transition-[background-color,border-color,transform] duration-300 hover:border-white/35 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-soft active:scale-[0.94]"
          aria-label="上一張"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>

        <div className="flex items-center gap-2">
          {items.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              aria-pressed={index === currentIndex}
              className={`h-2 rounded-full transition-[background-color,width,transform] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-soft active:scale-[0.9] ${
                index === currentIndex
                  ? "w-6 bg-white"
                  : "w-2 bg-white/40 hover:bg-white/60"
              }`}
              aria-label={`前往第 ${index + 1} 張`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setCurrentIndex((prev) =>
              prev === items.length - 1 ? 0 : prev + 1
            )
          }
          className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 p-2 text-white backdrop-blur transition-[background-color,border-color,transform] duration-300 hover:border-white/35 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-soft active:scale-[0.94]"
          aria-label="下一張"
        >
          <ArrowRight size={20} weight="bold" />
        </button>
      </div>
    </section>
  );
}
