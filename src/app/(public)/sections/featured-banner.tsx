import { getFeaturedPlanPresentations } from "@/lib/plan-presentations";
import { FeaturedOfferingBanner } from "@/components/offerings/featured-offering-banner";
import { auth } from "@/lib/auth";
import { getEntitledPlanIds } from "@/lib/access";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { getPublishedCourseStatsForPlan } from "@/lib/queries/course-catalog";

export interface CourseStats {
  chapterCount: number;
  lessonCount: number;
  totalDurationHours: number;
  previewCount: number;
}

export interface BannerItem {
  plan: Plan;
  presentation: PlanPresentation;
  courseStats?: CourseStats;
  alreadyPurchased?: boolean;
}

async function getCourseStatsForPlan(
  planId: string
): Promise<CourseStats | undefined> {
  const stats = await getPublishedCourseStatsForPlan(planId);
  if (!stats) return undefined;
  return {
    chapterCount: stats.chapterCount,
    lessonCount: stats.lessonCount,
    totalDurationHours:
      Math.round((stats.totalDurationSeconds / 3600) * 10) / 10,
    previewCount: stats.previewCount,
  };
}

export async function FeaturedBannerSection() {
  const presentations = await getFeaturedPlanPresentations();

  if (!presentations || presentations.length === 0) {
    return null;
  }

  const session = await auth();
  const entitled = session?.user?.id
    ? await getEntitledPlanIds(session.user.id)
    : new Set<string>();

  // Enrich items with course stats and purchase state
  const items: BannerItem[] = await Promise.all(
    presentations.map(async (item) => {
      const alreadyPurchased = entitled.has(item.plan.id);
      if (item.presentation.offeringType === "course") {
        const courseStats = await getCourseStatsForPlan(item.plan.id);
        return { ...item, courseStats, alreadyPurchased };
      }
      return { ...item, alreadyPurchased };
    })
  );

  return <FeaturedOfferingBanner items={items} />;
}
