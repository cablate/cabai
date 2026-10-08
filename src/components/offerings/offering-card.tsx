import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarBlank,
  CheckCircle,
  DownloadSimple,
  GraduationCap,
  MonitorPlay,
  UserCircle,
  UsersThree,
  Wrench,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { planPath } from "@/lib/plan-url";
import { cn, formatPrice } from "@/lib/utils";
import type { OfferingType } from "@/lib/validations/plan-presentations";
import type { PublishedCourseStats } from "@/lib/queries/course-catalog";
import { resolveProductAcquisitionState } from "@/lib/product-discovery";

interface OfferingCardProps {
  plan: Plan;
  presentation: PlanPresentation;
  alreadyPurchased?: boolean;
  index?: number;
  courseStats?: PublishedCourseStats | null;
}

const offeringTypeLabels: Record<OfferingType, string> = {
  course: "線上課程",
  lecture: "線上講座",
  free_event: "免費活動",
  offline_event: "線下活動",
  service: "服務方案",
  membership: "會員訂閱",
  download: "下載資源",
};

const offeringTypeIcons: Record<OfferingType, typeof GraduationCap> = {
  course: GraduationCap,
  lecture: MonitorPlay,
  free_event: CalendarBlank,
  offline_event: CalendarBlank,
  service: Wrench,
  membership: UsersThree,
  download: DownloadSimple,
};

const frequencyLabels: Record<string, string> = {
  daily: "每日",
  weekly: "每週",
  monthly: "每月",
  quarterly: "每季",
};

function metadataObject(presentation: PlanPresentation): Record<string, unknown> {
  return (presentation.metadataJson as Record<string, unknown> | null) || {};
}

function compact(parts: Array<string | null | undefined>): string[] {
  return parts.filter((part): part is string => Boolean(part));
}

function renderMetadataLine(
  presentation: PlanPresentation,
  offeringType: OfferingType,
  courseStats?: PublishedCourseStats | null,
): string {
  const metadata = metadataObject(presentation);

  switch (offeringType) {
    case "course": {
      if (courseStats) {
        const durationHours =
          Math.round((courseStats.totalDurationSeconds / 3600) * 10) / 10;
        return compact([
          courseStats.chapterCount > 0 ? `${courseStats.chapterCount} 章` : null,
          courseStats.lessonCount > 0 ? `${courseStats.lessonCount} 堂` : null,
          durationHours > 0 ? `約 ${durationHours} 小時` : null,
        ]).join(" · ") || "課程內容與章節預覽";
      }
      const parts = compact([
        typeof metadata.chapterCount === "number" ? `${metadata.chapterCount} 章` : null,
        typeof metadata.lessonCount === "number" ? `${metadata.lessonCount} 堂` : null,
        typeof metadata.estimatedHours === "number" ? `約 ${metadata.estimatedHours} 小時` : null,
      ]);
      return parts.length > 0 ? parts.join(" · ") : "課程內容與章節預覽";
    }
    case "lecture": {
      const speaker = typeof metadata.speaker === "string" ? metadata.speaker : null;
      const eventDate = typeof metadata.eventDate === "string" ? new Date(metadata.eventDate).toLocaleDateString("zh-TW") : null;
      return compact([speaker, eventDate]).join(" · ") || "線上講座";
    }
    case "free_event":
    case "offline_event": {
      const eventDate = typeof metadata.eventDate === "string" ? new Date(metadata.eventDate).toLocaleDateString("zh-TW") : null;
      const venue = typeof metadata.venue === "string" ? metadata.venue : null;
      const capacity = typeof metadata.capacity === "number" ? `${metadata.capacity} 人` : null;
      return compact([eventDate, venue, capacity]).join(" · ") || "活動資訊";
    }
    case "service": {
      const timeline = typeof metadata.expectedTimelineWeeks === "number" ? `約 ${metadata.expectedTimelineWeeks} 週` : null;
      const scope = typeof metadata.serviceScope === "string" ? metadata.serviceScope : null;
      return compact([timeline, scope]).join(" · ") || "購買後安排服務流程";
    }
    case "membership": {
      const frequency = typeof metadata.updateFrequency === "string"
        ? frequencyLabels[metadata.updateFrequency] || metadata.updateFrequency
        : null;
      return frequency ? `${frequency}更新` : "會員權益與專屬內容";
    }
    case "download": {
      const fileFormat = typeof metadata.fileFormat === "string" ? metadata.fileFormat : null;
      const numberOfFiles = typeof metadata.numberOfFiles === "number" ? `${metadata.numberOfFiles} 個檔案` : null;
      return compact([fileFormat, numberOfFiles]).join(" · ") || "購買後下載";
    }
    default: {
      const _exhaustive: never = offeringType;
      return _exhaustive;
    }
  }
}

function getPriceLabel(plan: Plan): string {
  if (plan.amount === 0) return "免費";
  const price = formatPrice(plan.amount);
  if (plan.billingPeriod === "monthly") return `${price} / 每月`;
  if (plan.billingPeriod === "yearly") return `${price} / 每年`;
  return `${price} 一次付費`;
}

function getInstructorName(presentation: PlanPresentation): string | null {
  const instructor = metadataObject(presentation).instructor as { name?: string } | undefined;
  return instructor?.name || null;
}

function OfferingArtwork({
  presentation,
  typeLabel,
  TypeIcon,
  index,
  sizes,
  className,
  compact = false,
}: {
  presentation: PlanPresentation;
  typeLabel: string;
  TypeIcon: typeof GraduationCap;
  index: number;
  sizes: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-ink", className)}>
      {presentation.coverImage ? (
        <>
          <Image
            src={presentation.coverImage}
            alt={presentation.title}
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.035]"
          />
          <div className="absolute inset-0 bg-ink/18" />
        </>
      ) : (
        <>
          <span
            className={cn(
              "absolute font-display font-medium leading-none tracking-[-0.09em] text-text-inverted/[0.055]",
              compact ? "-bottom-2 -right-1 text-6xl" : "-bottom-7 -right-2 text-[7.5rem]",
            )}
            aria-hidden="true"
          >
            {(index + 1).toString().padStart(2, "0")}
          </span>
          {compact ? (
            <div className="absolute inset-0 flex items-center justify-center text-amber-soft">
              <TypeIcon size={24} weight="duotone" aria-hidden="true" />
            </div>
          ) : (
            <>
              <span className="absolute -right-12 top-1/2 size-40 -translate-y-1/2 rotate-45 border border-border-inverted" aria-hidden="true" />
              <span className="absolute -right-5 top-1/2 size-24 -translate-y-1/2 rotate-45 border border-border-inverted" aria-hidden="true" />
              <div className="absolute inset-x-4 bottom-4 top-4 flex flex-col justify-between">
                <span className="font-mono text-xs text-text-inverted/70">CABAI / {(index + 1).toString().padStart(2, "0")}</span>
                <span className="flex items-center gap-2 text-sm font-medium text-amber-soft">
                  <TypeIcon size={18} weight="duotone" aria-hidden="true" />
                  {typeLabel}
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function OfferingCard({
  plan,
  presentation,
  alreadyPurchased = false,
  index = 0,
  courseStats,
}: OfferingCardProps) {
  const offeringType = presentation.offeringType as OfferingType;
  const typeLabel = offeringTypeLabels[offeringType];
  const TypeIcon = offeringTypeIcons[offeringType];
  const metadataLine = renderMetadataLine(
    presentation,
    offeringType,
    courseStats,
  );
  const priceLabel = getPriceLabel(plan);
  const instructorName = getInstructorName(presentation);
  const acquisitionState = resolveProductAcquisitionState({
    alreadyPurchased,
    status: plan.status,
    amount: plan.amount,
  });
  const isInactive = acquisitionState === "unavailable";
  const ctaLabel = {
    owned: "進入內容",
    unavailable: "查看資訊",
    free: "查看內容",
    paid: "查看方案",
  }[acquisitionState];
  const ctaHref = acquisitionState === "owned"
    ? planPath(plan, "my")
    : planPath(plan, "product");
  const valueLabel = acquisitionState === "owned"
    ? "已在會員中心"
    : acquisitionState === "unavailable"
      ? "目前無法取得"
      : priceLabel;

  return (
    <>
      <Link prefetch={false} href={ctaHref} className="group block h-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden">
        <article className="grid min-h-[7.5rem] grid-cols-[4.75rem_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border border-border-subtle bg-surface p-2.5 shadow-card transition-[border-color,transform,box-shadow] group-hover:border-border-strong group-focus-visible:border-border-strong group-focus-visible:shadow-elevated active:scale-[0.99]">
          <OfferingArtwork
            presentation={presentation}
            typeLabel={typeLabel}
            TypeIcon={TypeIcon}
            index={index}
            sizes="76px"
            className="rounded-lg"
            compact
          />
          <div className="flex min-w-0 flex-col justify-between py-0.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-text-muted">
                <span>{typeLabel}</span>
                {alreadyPurchased ? <Badge variant="success" className="px-2 py-0.5 text-[0.62rem]">已擁有</Badge> : null}
                {isInactive ? <Badge className="px-2 py-0.5 text-[0.62rem]">暫不開放</Badge> : null}
              </div>
              <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-text-primary [overflow-wrap:anywhere]">{presentation.title}</h3>
              <p className="mt-1 line-clamp-1 text-xs leading-5 text-text-secondary">{presentation.subtitle || metadataLine}</p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-text-primary">
                  {acquisitionState === "paid"
                    ? priceLabel
                    : acquisitionState === "free"
                      ? "免費"
                      : acquisitionState === "owned"
                        ? "已擁有"
                        : "暫不開放"}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                {ctaLabel}
                <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
              </span>
            </div>
          </div>
        </article>
      </Link>

      <Link prefetch={false} href={ctaHref} className="group hidden h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:block">
        <article className="h-full overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated group-focus-visible:-translate-y-0.5 group-focus-visible:border-border-strong group-focus-visible:shadow-elevated lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="relative">
            <OfferingArtwork
              presentation={presentation}
              typeLabel={typeLabel}
              TypeIcon={TypeIcon}
              index={index}
              sizes="(max-width: 1024px) 50vw, 13rem"
              className="aspect-[16/9] w-full lg:absolute lg:inset-0 lg:aspect-auto"
            />
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
              {alreadyPurchased ? (
                <Badge variant="success" className="gap-1 shadow-card">
                  <CheckCircle size={13} weight="fill" aria-hidden="true" />
                  已擁有
                </Badge>
              ) : null}
              {isInactive ? <Badge className="shadow-card">暫不開放</Badge> : null}
            </div>
          </div>

          <div className="flex min-h-[18rem] min-w-0 flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <TypeIcon size={15} weight="duotone" className="text-accent" aria-hidden="true" />
                {typeLabel}
              </span>
              {instructorName ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <UserCircle size={15} weight="duotone" aria-hidden="true" />
                  <span className="truncate">{instructorName}</span>
                </span>
              ) : null}
            </div>

            <h3 className="mt-5 font-display text-xl font-medium leading-tight tracking-[-0.03em] text-text-primary [overflow-wrap:anywhere] sm:text-2xl">{presentation.title}</h3>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary [overflow-wrap:anywhere]">{presentation.subtitle || metadataLine}</p>

            <div className="mt-5 flex items-center gap-2 border-t border-border-subtle pt-4 text-xs text-text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              <span className="truncate">{metadataLine}</span>
              {isInactive ? <Badge className="ml-auto shrink-0">暫不開放</Badge> : null}
            </div>

            <div className="mt-auto flex items-end justify-between gap-4 pt-6">
              <div>
                <span className="block text-xs text-text-muted">
                  {acquisitionState === "paid" || acquisitionState === "free" ? "取得方式" : "取得狀態"}
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-text-primary">{valueLabel}</span>
              </div>
              <span className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                isInactive && !alreadyPurchased ? "bg-surface-muted text-text-muted" : "bg-ink text-text-inverted group-hover:bg-surface-inverse-hover group-focus-visible:bg-surface-inverse-hover",
              )}>
                {ctaLabel}
                <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
              </span>
            </div>
          </div>
        </article>
      </Link>
    </>
  );
}
