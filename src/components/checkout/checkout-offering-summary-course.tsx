import type { Plan, PlanPresentation } from "@/lib/db/schema";
import type { CourseMetadata } from "@/lib/validations/plan-presentations";
import { Badge } from "@/components/ui/badge";
import type { PublishedCourseStats } from "@/lib/queries/course-catalog";

export interface CourseCheckoutSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
  courseStats?: PublishedCourseStats | null;
}

export function CourseCheckoutSummary({
  presentation,
  courseStats,
}: CourseCheckoutSummaryProps) {
  const metadata = presentation.metadataJson as CourseMetadata | null;
  const chapterCount = courseStats?.chapterCount ?? metadata?.chapterCount;
  const lessonCount = courseStats?.lessonCount ?? metadata?.lessonCount;
  const estimatedHours = courseStats
    ? Math.round((courseStats.totalDurationSeconds / 3600) * 10) / 10
    : metadata?.estimatedHours;
  const previewCount = courseStats?.previewCount ?? metadata?.freeLessonCount;

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
        <Badge variant="info">課程</Badge>
      </div>

      {(chapterCount || lessonCount || estimatedHours) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-3">
          {chapterCount ? (
            <div>
              <p className="text-xs font-medium text-text-muted">
                章節
              </p>
              <p className="mt-1 font-display text-2xl font-medium text-text-primary">
                {chapterCount}
              </p>
            </div>
          ) : null}
          {lessonCount ? (
            <div>
              <p className="text-xs font-medium text-text-muted">
                堂課
              </p>
              <p className="mt-1 font-display text-2xl font-medium text-text-primary">
                {lessonCount}
              </p>
            </div>
          ) : null}
          {estimatedHours ? (
            <div>
              <p className="text-xs font-medium text-text-muted">
                時長
              </p>
              <p className="mt-1 font-display text-2xl font-medium text-text-primary">
                {estimatedHours}h
              </p>
            </div>
          ) : null}
        </div>
      )}

      {previewCount && previewCount > 0 ? (
        <div className="flex items-center gap-2">
          <Badge variant="success">可免費試看</Badge>
          <span className="text-xs text-text-muted">
            {previewCount} 堂課程可先預覽
          </span>
        </div>
      ) : null}
    </div>
  );
}
