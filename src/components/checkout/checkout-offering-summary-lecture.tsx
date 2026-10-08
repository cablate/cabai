import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { LectureMetadata } from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";

export interface LectureCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function LectureCheckoutSummary({
  presentation,
}: LectureCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as LectureMetadata | null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-text-primary [text-wrap:balance]">
            {presentation.title}
          </h3>
          {metadata?.speaker && (
            <p className="mt-2 text-sm text-text-secondary">
              講者：{metadata.speaker}
            </p>
          )}
        </div>
        <Badge variant="info">講座</Badge>
      </div>

      {metadata && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {metadata.eventDate && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">日期</span>
              <span className="text-sm text-text-primary">
                {formatDate(new Date(metadata.eventDate))} {metadata.eventTime}
              </span>
            </div>
          )}

          {metadata.durationMinutes && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">時長</span>
              <span className="text-sm text-text-primary">
                {Math.floor(metadata.durationMinutes / 60)} 小時{" "}
                {metadata.durationMinutes % 60} 分鐘
              </span>
            </div>
          )}

          {metadata.hasReplay && (
            <div className="flex items-center gap-2">
              <Badge variant="success">有回放</Badge>
              <span className="text-xs text-text-muted">
                直播後可查看錄製版本
              </span>
            </div>
          )}
        </div>
      )}

      {presentation.subtitle && (
        <div className="text-sm leading-6 text-text-secondary [text-wrap:pretty]">
          {presentation.subtitle}
        </div>
      )}
    </div>
  );
}
