import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { CourseCheckoutSummary } from "./checkout-offering-summary-course";
import { LectureCheckoutSummary } from "./checkout-offering-summary-lecture";
import { ServiceCheckoutSummary } from "./checkout-offering-summary-service";
import { MembershipCheckoutSummary } from "./checkout-offering-summary-membership";
import { DownloadCheckoutSummary } from "./checkout-offering-summary-download";
import { EventCheckoutSummary } from "./checkout-offering-summary-event";
import type { PublishedCourseStats } from "@/lib/queries/course-catalog";

export interface CheckoutOfferingSummaryProps {
  presentation: PlanPresentation;
  plan: Plan;
  courseStats?: PublishedCourseStats | null;
}

/**
 * Type-aware checkout summary component.
 * Renders offering-specific content based on offeringType.
 */
export function CheckoutOfferingSummary({
  presentation,
  plan,
  courseStats,
}: CheckoutOfferingSummaryProps) {
  const { offeringType } = presentation;

  switch (offeringType) {
    case "course":
      return (
        <CourseCheckoutSummary
          presentation={presentation}
          plan={plan}
          courseStats={courseStats}
        />
      );
    case "lecture":
      return (
        <LectureCheckoutSummary
          presentation={presentation}
          plan={plan}
        />
      );
    case "service":
      return (
        <ServiceCheckoutSummary
          presentation={presentation}
          plan={plan}
        />
      );
    case "membership":
      return (
        <MembershipCheckoutSummary
          presentation={presentation}
          plan={plan}
        />
      );
    case "download":
      return (
        <DownloadCheckoutSummary
          presentation={presentation}
          plan={plan}
        />
      );
    case "free_event":
    case "offline_event":
      return (
        <EventCheckoutSummary
          presentation={presentation}
          plan={plan}
        />
      );
    default: {
      const _exhaustive: never = offeringType;
      return _exhaustive;
    }
  }
}
