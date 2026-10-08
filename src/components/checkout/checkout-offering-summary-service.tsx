import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { ServiceMetadata } from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";

export interface ServiceCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
}

export function ServiceCheckoutSummary({
  presentation,
}: ServiceCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as ServiceMetadata | null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-text-primary [text-wrap:balance]">
            {presentation.title}
          </h3>
          {metadata?.serviceScope && (
            <p className="mt-2 text-sm leading-6 text-text-secondary [text-wrap:pretty]">
              {metadata.serviceScope}
            </p>
          )}
        </div>
        <Badge variant="warning">服務</Badge>
      </div>

      {metadata && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {metadata.expectedTimelineWeeks && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">預計週期</span>
              <span className="text-sm text-text-primary">
                {metadata.expectedTimelineWeeks} 週
              </span>
            </div>
          )}

          {metadata.deliverySteps && metadata.deliverySteps.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-text-muted">
                交付流程
              </p>
              <ul className="space-y-1">
                {metadata.deliverySteps.slice(0, 3).map((step) => (
                  <li key={step.step} className="text-sm text-text-secondary">
                    <span className="font-medium">步驟 {step.step}：</span>{" "}
                    {step.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {metadata.requiredInputs && metadata.requiredInputs.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-light p-3">
              <span className="text-sm font-medium text-warning">
                ⓘ 需要準備
              </span>
              <ul className="space-y-0.5 text-sm text-text-secondary">
                {metadata.requiredInputs.slice(0, 2).map((input, idx) => (
                  <li key={idx}>• {input}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
