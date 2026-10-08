import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type {
  FreeEventMetadata,
  OfflineEventMetadata,
} from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";

export interface EventCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function EventCheckoutSummary({
  presentation,
}: EventCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as
    | FreeEventMetadata
    | OfflineEventMetadata
    | null;

  const isFreeEvent = presentation.offeringType === "free_event";
  const isOfflineEvent = presentation.offeringType === "offline_event";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-text-primary [text-wrap:balance]">
            {presentation.title}
          </h3>
          {presentation.subtitle && (
            <p className="mt-2 text-sm leading-6 text-text-secondary [text-wrap:pretty]">
              {presentation.subtitle}
            </p>
          )}
        </div>
        <Badge variant={isFreeEvent ? "info" : "warning"}>
          {isFreeEvent ? "免費活動" : "付費活動"}
        </Badge>
      </div>

      {metadata && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {metadata.eventDate && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">日期</span>
              <span className="text-sm text-text-primary">
                {formatDate(metadata.eventDate)}
                {isOfflineEvent && "eventTime" in metadata && metadata.eventTime && ` ${metadata.eventTime}`}
              </span>
            </div>
          )}

          {isOfflineEvent && "venue" in metadata && metadata.venue && (
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-sm font-medium text-text-muted">
                地點
              </span>
              <div className="text-sm text-text-primary">
                <p>{metadata.venue}</p>
                {"address" in metadata && metadata.address && (
                  <p className="mt-1 text-xs text-text-muted">{metadata.address}</p>
                )}
              </div>
            </div>
          )}

          {metadata.capacity && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">容量</span>
              <span className="text-sm text-text-primary">
                {metadata.capacity} 人次
              </span>
            </div>
          )}

          {isOfflineEvent && "ticketTiers" in metadata && metadata.ticketTiers && (
            <div>
              <p className="mb-2 text-sm font-medium text-text-muted">票種</p>
              <ul className="space-y-1">
                {metadata.ticketTiers.slice(0, 2).map((tier, idx) => (
                  <li key={idx} className="text-sm text-text-secondary">
                    {tier.name} × {tier.quantity}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isOfflineEvent && "admissionNotes" in metadata && metadata.admissionNotes && (
            <div className="rounded-xl border border-info/20 bg-info-light p-3">
              <p className="mb-1 text-xs font-medium text-info">
                入場說明
              </p>
              <p className="text-xs leading-5 text-text-secondary">{metadata.admissionNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
