"use client";

import { formatPrice } from "@/lib/utils";
import type { Plan, PlanPresentation } from "@/lib/db/schema";

interface OfferInfoCardProps {
  plan: Plan;
  presentation: PlanPresentation;
  chapterTitles?: string[];
}

type CourseMetadata = {
  chapterCount?: number;
  estimatedHours?: number;
  chapters?: string[];
  hasFreeTrial?: boolean;
};

type LectureMetadata = {
  speaker?: string;
  eventDate?: string;
  hasReplay?: boolean;
  agenda?: string[];
};

type FreeEventMetadata = {
  eventDate?: string;
  capacity?: number;
  reminderMethod?: string;
  targetAudience?: string;
};

type OfflineEventMetadata = {
  venue?: string;
  eventDate?: string;
  ticketTypes?: string[];
  remainingCapacity?: number;
  entryInfo?: string;
};

type ServiceMetadata = {
  expectedTimelineWeeks?: number;
  deliverables?: string[];
  processSteps?: string[];
};

type MembershipMetadata = {
  benefits?: string[];
  updateFrequency?: string;
  thisMonthContent?: string;
};

type DownloadMetadata = {
  fileFormat?: string;
  fileSize?: string;
  deliveryMethod?: string;
};

const cardTitles: Record<string, string> = {
  course: "章節預覽",
  lecture: "講座議程",
  free_event: "活動資訊",
  offline_event: "票券資訊",
  service: "服務交付",
  membership: "會員權益",
  download: "檔案資訊",
};

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
      return "每月";
    case "yearly":
      return "每年";
    case "one-time":
      return "一次付費";
    default:
      return period;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-text-muted">{label}</span>
      <span className="text-right text-sm text-text-primary">{value}</span>
    </div>
  );
}

function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.slice(0, 5).map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-sm text-text-secondary"
        >
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-soft" />
          {item}
        </li>
      ))}
      {items.length > 5 && (
        <li className="text-xs text-text-muted">
          +{items.length - 5} 項更多
        </li>
      )}
    </ul>
  );
}

function renderTypeContent(
  offeringType: string,
  metadata: Record<string, unknown> | null,
  chapterTitles?: string[]
) {
  if (!metadata) return null;

  switch (offeringType) {
    case "course": {
      const m = metadata as CourseMetadata;
      // Prefer DB chapters over metadata chapters
      const chaptersToShow =
        chapterTitles && chapterTitles.length > 0
          ? chapterTitles
          : m.chapters;
      const chapterCount =
        chaptersToShow?.length || m.chapterCount || 0;
      return (
        <>
          {chapterCount > 0 && (
            <InfoRow label="章節" value={`${chapterCount} 章`} />
          )}
          {m.estimatedHours != null && (
            <InfoRow label="時長" value={`約 ${m.estimatedHours} 小時`} />
          )}
          {m.hasFreeTrial && (
            <InfoRow label="免費試看" value="有" />
          )}
          {chaptersToShow && chaptersToShow.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                課程內容
              </span>
              <InfoList items={chaptersToShow} />
            </div>
          )}
        </>
      );
    }

    case "lecture": {
      const m = metadata as LectureMetadata;
      return (
        <>
          {m.speaker && <InfoRow label="講者" value={m.speaker} />}
          {m.eventDate && (
            <InfoRow label="日期" value={formatDate(m.eventDate)} />
          )}
          {m.hasReplay != null && (
            <InfoRow label="回放" value={m.hasReplay ? "提供回放" : "僅限直播"} />
          )}
          {m.agenda && m.agenda.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                議程
              </span>
              <InfoList items={m.agenda} />
            </div>
          )}
        </>
      );
    }

    case "free_event": {
      const m = metadata as FreeEventMetadata;
      return (
        <>
          <InfoRow label="費用" value="免費報名" />
          {m.eventDate && (
            <InfoRow label="日期" value={formatDate(m.eventDate)} />
          )}
          {m.capacity != null && (
            <InfoRow label="名額" value={`${m.capacity} 人`} />
          )}
          {m.targetAudience && (
            <InfoRow label="對象" value={m.targetAudience} />
          )}
          {m.reminderMethod && (
            <InfoRow label="提醒" value={m.reminderMethod} />
          )}
        </>
      );
    }

    case "offline_event": {
      const m = metadata as OfflineEventMetadata;
      return (
        <>
          {m.venue && <InfoRow label="地點" value={m.venue} />}
          {m.eventDate && (
            <InfoRow label="日期" value={formatDate(m.eventDate)} />
          )}
          {m.remainingCapacity != null && (
            <InfoRow label="剩餘名額" value={`${m.remainingCapacity} 位`} />
          )}
          {m.entryInfo && <InfoRow label="入場" value={m.entryInfo} />}
          {m.ticketTypes && m.ticketTypes.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                票種
              </span>
              <InfoList items={m.ticketTypes} />
            </div>
          )}
        </>
      );
    }

    case "service": {
      const m = metadata as ServiceMetadata;
      return (
        <>
          {m.expectedTimelineWeeks != null && (
            <InfoRow
              label="預計時程"
              value={`約 ${m.expectedTimelineWeeks} 週`}
            />
          )}
          {m.deliverables && m.deliverables.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                交付項目
              </span>
              <InfoList items={m.deliverables} />
            </div>
          )}
          {m.processSteps && m.processSteps.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                服務流程
              </span>
              <InfoList items={m.processSteps} />
            </div>
          )}
        </>
      );
    }

    case "membership": {
      const m = metadata as MembershipMetadata;
      const frequencyLabels: Record<string, string> = {
        daily: "每日",
        weekly: "每週",
        monthly: "每月",
        quarterly: "每季",
      };
      return (
        <>
          {m.updateFrequency && (
            <InfoRow
              label="更新頻率"
              value={frequencyLabels[m.updateFrequency] || m.updateFrequency}
            />
          )}
          {m.thisMonthContent && (
            <InfoRow label="本月內容" value={m.thisMonthContent} />
          )}
          {m.benefits && m.benefits.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <span className="text-xs font-medium text-text-muted">
                會員權益
              </span>
              <InfoList items={m.benefits} />
            </div>
          )}
        </>
      );
    }

    case "download": {
      const m = metadata as DownloadMetadata;
      return (
        <>
          {m.fileFormat && <InfoRow label="格式" value={m.fileFormat} />}
          {m.fileSize && <InfoRow label="大小" value={m.fileSize} />}
          {m.deliveryMethod && (
            <InfoRow label="取得方式" value={m.deliveryMethod} />
          )}
        </>
      );
    }

    default:
      return null;
  }
}

export function OfferInfoCard({
  plan,
  presentation,
  chapterTitles,
}: OfferInfoCardProps) {
  const { offeringType, metadataJson } = presentation;
  const billingPeriod = mapBillingPeriod(plan.billingPeriod);
  const cardTitle = cardTitles[offeringType] || "詳細資訊";
  const typeLabel = typeLabels[offeringType] || offeringType;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted/60 backdrop-blur-sm p-5 md:p-6">
      {/* Card Header: type badge + type-specific title */}
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-md bg-amber-soft/20 px-2 py-0.5 text-xs font-medium text-amber-soft border border-amber-soft/30">
          {typeLabel}
        </span>
        <h4 className="text-base font-semibold text-text-primary">
          {cardTitle}
        </h4>
      </div>

      {/* Type-specific content */}
      <div className="mt-4 divide-y divide-border-subtle/50">
        {renderTypeContent(
          offeringType,
          metadataJson as Record<string, unknown> | null,
          chapterTitles
        )}
      </div>

      {/* Price + CTA */}
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="block text-xs text-text-muted">
              {billingPeriod}
            </span>
            <span className="mt-1 block font-mono text-xl font-semibold text-text-primary">
              {formatPrice(plan.amount)}
            </span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-zinc-800 active:scale-[0.98]">
            {presentation.ctaLabel || "立即購買"}
          </span>
        </div>
      </div>
    </div>
  );
}
