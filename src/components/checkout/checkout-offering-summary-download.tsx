import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { DownloadMetadata } from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";

export interface DownloadCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
}

const licenseLabels: Record<string, string> = {
  personal: "個人使用",
  commercial: "商業使用",
  educational: "教育用途",
};

export function DownloadCheckoutSummary({
  presentation,
}: DownloadCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as DownloadMetadata | null;

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
        <Badge variant="success">下載</Badge>
      </div>

      {metadata && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {metadata.numberOfFiles && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">檔案數</span>
              <span className="text-sm text-text-primary">
                {metadata.numberOfFiles} 個檔案
              </span>
            </div>
          )}

          {metadata.fileFormat && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">格式</span>
              <span className="text-sm text-text-primary">
                {metadata.fileFormat}
              </span>
            </div>
          )}

          {metadata.fileSize && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">大小</span>
              <span className="text-sm text-text-primary">{metadata.fileSize}</span>
            </div>
          )}

          {metadata.license && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-muted">授權</span>
              <Badge variant="default">
                {licenseLabels[metadata.license] || metadata.license}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
