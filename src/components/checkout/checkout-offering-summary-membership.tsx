import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { MembershipMetadata } from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";

export interface MembershipCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
}

const updateFrequencyLabels: Record<string, string> = {
  daily: "每日更新",
  weekly: "每週更新",
  monthly: "每月更新",
  quarterly: "每季更新",
};

export function MembershipCheckoutSummary({
  presentation,
}: MembershipCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as MembershipMetadata | null;

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
        <Badge variant="info">會員</Badge>
      </div>

      {metadata && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {metadata.updateFrequency && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">更新頻率</span>
              <span className="text-sm text-text-primary">
                {updateFrequencyLabels[metadata.updateFrequency] ||
                  metadata.updateFrequency}
              </span>
            </div>
          )}

          {metadata.monthlyContentCount && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">
                月均內容數
              </span>
              <span className="text-sm text-text-primary">
                約 {metadata.monthlyContentCount} 份
              </span>
            </div>
          )}

          {metadata.benefits && metadata.benefits.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-text-muted">會員權益</p>
              <ul className="space-y-1">
                {metadata.benefits.slice(0, 3).map((benefit, idx) => (
                  <li key={idx} className="text-sm text-text-secondary">
                    ✓ {benefit.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(metadata.exclusiveChannelAccess || metadata.communityEvents) && (
            <div className="flex gap-2 flex-wrap">
              {metadata.exclusiveChannelAccess && (
                <Badge variant="success">專屬討論區</Badge>
              )}
              {metadata.communityEvents && (
                <Badge variant="success">社群活動</Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
