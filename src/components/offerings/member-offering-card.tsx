"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  FileArrowDown,
  GraduationCap,
  ShoppingBag,
  Wrench,
} from "@phosphor-icons/react";
import type { Plan, PlanPresentation, UserPurchase } from "@/lib/db/schema";
import type { OfferingType, CourseMetadata, LectureMetadata, ServiceMetadata, MembershipMetadata } from "@/lib/validations/plan-presentations";
import { planPath } from "@/lib/plan-url";
import type { CourseLearningSummary } from "@/lib/services/learning-summary-service";

interface MemberOfferingCardProps {
  plan: Plan;
  presentation: PlanPresentation | null;
  purchase: UserPurchase;
  isExpired?: boolean;
  learningSummary?: CourseLearningSummary;
}

export function MemberOfferingCard({
  plan,
  presentation,
  purchase,
  isExpired = false,
  learningSummary,
}: MemberOfferingCardProps) {
  const offeringType = (presentation?.offeringType ?? "course") as OfferingType;
  const title = presentation?.title ?? plan.name;
  const description = presentation?.subtitle ?? plan.description;
  const coverImage = presentation?.coverImage ?? plan.image;

  // Type-specific metadata and CTA
  const getTypeMetadata = () => {
    switch (offeringType) {
      case "course": {
        const metadata = presentation?.metadataJson as CourseMetadata | null | undefined;
        return {
          typeLabel: "課程",
          Icon: GraduationCap,
          subtitle: metadata?.chapterCount
            ? `${metadata.chapterCount} 章節`
            : "課程內容",
          actionLabel: "繼續學習",
        };
      }
      case "lecture": {
        const metadata = presentation?.metadataJson as LectureMetadata | null | undefined;
        const eventDate = metadata?.eventDate && typeof metadata.eventDate === 'string'
          ? new Date(metadata.eventDate)
          : null;
        return {
          typeLabel: "講座",
          Icon: CalendarBlank,
          subtitle: eventDate
            ? `${eventDate.toLocaleDateString("zh-TW", {
                month: "short",
                day: "numeric",
              })}`
            : "講座內容",
          actionLabel: "查看講座",
        };
      }
      case "free_event":
      case "offline_event": {
        const metadata = presentation?.metadataJson as Record<string, unknown> | null | undefined;
        const eventDate = metadata?.eventDate && typeof metadata.eventDate === 'string'
          ? new Date(metadata.eventDate)
          : null;
        return {
          typeLabel: "活動",
          Icon: CalendarBlank,
          subtitle: eventDate
            ? `${eventDate.toLocaleDateString("zh-TW", {
                month: "short",
                day: "numeric",
              })}`
            : "活動內容",
          actionLabel: "查看活動",
        };
      }
      case "service": {
        const metadata = presentation?.metadataJson as ServiceMetadata | null | undefined;
        return {
          typeLabel: "服務",
          Icon: Wrench,
          subtitle: metadata?.expectedTimelineWeeks
            ? `${metadata.expectedTimelineWeeks} 週內交付`
            : "服務進度",
          actionLabel: "查看進度",
        };
      }
      case "membership": {
        const metadata = presentation?.metadataJson as MembershipMetadata | null | undefined;
        const frequency = metadata?.updateFrequency || "monthly";
        const frequencyLabel: Record<string, string> = {
          daily: "每日",
          weekly: "每週",
          monthly: "每月",
          quarterly: "每季",
        };
        return {
          typeLabel: "會員",
          Icon: CheckCircle,
          subtitle: `${frequencyLabel[frequency] || "定期"}更新`,
          actionLabel: "查看會員內容",
        };
      }
      case "download": {
        return {
          typeLabel: "檔案",
          Icon: FileArrowDown,
          subtitle: "可下載資源",
          actionLabel: "下載",
        };
      }
      default:
        return {
          typeLabel: "內容",
          Icon: ShoppingBag,
          subtitle: "會員內容",
          actionLabel: "查看內容",
        };
    }
  };

  const typeInfo = getTypeMetadata();
  const Icon = typeInfo.Icon;
  const statusSubtitle =
    offeringType === "course" && learningSummary
      ? `${learningSummary.completedLessonCount}/${learningSummary.orderedLessonIds.length} 堂 · ${learningSummary.progressPercent}%`
      : typeInfo.subtitle;
  const actionHref = offeringType === "course" && learningSummary
    ? learningSummary.resumeHref
    : planPath(plan, "my");
  const actionLabel = offeringType === "course" && learningSummary
    ? learningSummary.isCompleted
      ? "查看課程"
      : learningSummary.completedLessonCount > 0
        ? "繼續學習"
        : "開始學習"
    : typeInfo.actionLabel;

  return (
    <>
      <Link prefetch={false}
        href={actionHref}
        className="group grid min-h-[104px] grid-cols-[88px_1fr] gap-3 rounded-2xl border border-border-subtle bg-surface p-3 transition-[border-color,transform,box-shadow] hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:border-border-strong active:scale-[0.99] sm:hidden"
      >
        <div className="relative h-20 overflow-hidden rounded-xl bg-surface-muted">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={title}
              fill
              sizes="88px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ShoppingBag size={22} className="text-text-muted" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted">
                <Icon size={11} weight="bold" />
                {typeInfo.typeLabel}
              </span>
              {isExpired && (
                <span className="rounded-full bg-warning-light px-2 py-0.5 text-[10px] font-medium text-warning">
                  已過期
                </span>
              )}
            </div>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
              {title}
            </h3>
            <p className="mt-1 line-clamp-1 text-xs text-text-secondary">
              {statusSubtitle}
            </p>
          </div>

          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-text-primary">
            {actionLabel}
            <ArrowRight size={12} weight="bold" />
          </div>
        </div>
      </Link>

      <div className="group hidden flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-border hover:shadow-card sm:flex">
        {/* Cover image */}
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ShoppingBag size={32} className="text-text-muted" />
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-[10px] font-medium uppercase text-text-muted">
              <Icon size={12} weight="bold" />
              {typeInfo.typeLabel}
            </span>
            {isExpired && (
              <span className="inline-flex items-center rounded-full bg-warning-light px-3 py-1 text-[10px] font-medium uppercase text-warning">
                已過期
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-text-primary leading-snug">
            {title}
          </h3>

          {description && (
            <p className="mt-2 flex-1 text-sm text-text-secondary leading-relaxed line-clamp-2">
              {description}
            </p>
          )}

          {/* Type-specific metadata */}
          <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-muted/60 px-3 py-1 text-xs text-text-secondary">
            <Clock size={12} weight="bold" className="text-text-muted" />
            {statusSubtitle}
          </div>

          {/* Purchase info */}
          <div className="mt-3 text-xs leading-relaxed text-text-muted">
            購買於：
            {purchase.grantedAt.toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {purchase.expiresAt && (
              <>
                <span className="mx-1">·</span>到期：
                {purchase.expiresAt.toLocaleDateString("zh-TW", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </>
            )}
          </div>

          <Link prefetch={false}
            href={actionHref}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-sm font-medium text-text-inverted transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            {actionLabel}
            <ArrowRight size={14} weight="bold" />
          </Link>
        </div>
      </div>
    </>
  );
}
