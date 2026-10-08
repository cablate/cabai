import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  courses,
  planCourses,
  lessons,
  planContents,
  plans,
  serviceConfigs,
  userProgress,
} from "@/lib/db/schema";
import type { OfferingType } from "@/lib/validations/plan-presentations";
import { planPath } from "@/lib/plan-url";

export type DeliveryKind = "course" | "content" | "service" | "pending";

export type DeliveryAction = {
  kind: DeliveryKind;
  href: string;
  label: string;
  note: string;
};

export type DeliveryCourse = {
  id: string;
  planId: string;
  title: string;
  description: string | null;
  image: string | null;
  lessonCount: number;
  completedLessonCount: number;
};

export type DeliveryContent = {
  id: string;
  planId: string;
  title: string;
  type: "video" | "pdf" | "text" | "download";
  sortOrder: number;
};

export type DeliveryService = {
  id: string;
  planId: string;
  serviceName: string;
  isActive: boolean;
};

export type DeliveryOverview = {
  planId: string;
  planSlug: string | null;
  courses: DeliveryCourse[];
  contents: DeliveryContent[];
  services: DeliveryService[];
  courseCount: number;
  lessonCount: number;
  completedLessonCount: number;
  contentCount: number;
  serviceCount: number;
  activeServiceCount: number;
  hasDelivery: boolean;
  primaryAction: DeliveryAction;
};

function emptyOverview(planId: string, planSlug: string | null = null): DeliveryOverview {
  const planRef = { id: planId, slug: planSlug };
  return {
    planId,
    planSlug,
    courses: [],
    contents: [],
    services: [],
    courseCount: 0,
    lessonCount: 0,
    completedLessonCount: 0,
    contentCount: 0,
    serviceCount: 0,
    activeServiceCount: 0,
    hasDelivery: false,
    primaryAction: {
      kind: "pending",
      href: planPath(planRef, "product"),
      label: "查看商品頁",
      note: "這個商品尚未設定站內交付內容。",
    },
  };
}

export function buildPrimaryAction(
  overview: Omit<DeliveryOverview, "primaryAction" | "hasDelivery">,
  offeringType?: OfferingType
): DeliveryAction {
  const planRef = { id: overview.planId, slug: overview.planSlug };
  const myHref = planPath(planRef, "my");
  const hasContent = overview.courseCount > 0 || overview.contentCount > 0 || overview.activeServiceCount > 0;

  if (!hasContent) {
    return {
      kind: "pending",
      href: myHref,
      label: "查看會員中心",
      note: "此內容尚未配置交付內容。",
    };
  }

  // If offeringType is provided, use type-specific routing
  if (offeringType) {
    switch (offeringType) {
      case "course":
        return {
          kind: "course",
          href: myHref,
          label: overview.completedLessonCount > 0 ? "繼續學習" : "開始學習",
          note: `${overview.courseCount} 門課程、${overview.lessonCount} 堂課`,
        };

      case "lecture":
      case "free_event":
        return {
          kind: "content",
          href: myHref,
          label: "查看講座",
          note: "已登記此講座",
        };

      case "offline_event":
        return {
          kind: "content",
          href: myHref,
          label: "查看票券",
          note: "票券已寄送至您的信箱",
        };

      case "service":
        return {
          kind: "service",
          href: myHref,
          label: "查看進度",
          note: `${overview.activeServiceCount} 項服務`,
        };

      case "membership":
        return {
          kind: "content",
          href: myHref,
          label: "探索會員內容",
          note: `${overview.contentCount} 份資料`,
        };

      case "download":
        return {
          kind: "content",
          href: myHref,
          label: "開始下載",
          note: "檔案已準備好下載",
        };

      default: {
        const _exhaustive: never = offeringType;
        return _exhaustive;
      }
    }
  }

  // Fallback behavior when no offeringType is provided
  // Build descriptive note
  const parts: string[] = [];
  if (overview.courseCount > 0) parts.push(`${overview.courseCount} 門課程`);
  if (overview.contentCount > 0) parts.push(`${overview.contentCount} 份資料`);
  if (overview.activeServiceCount > 0) parts.push(`${overview.activeServiceCount} 項服務`);

  // Determine label based on primary content type
  let label = "查看內容";
  if (overview.courseCount > 0 && overview.completedLessonCount > 0) {
    label = "繼續學習";
  } else if (overview.courseCount > 0) {
    label = "開始學習";
  }

  return {
    kind: overview.courseCount > 0 ? "course" : overview.contentCount > 0 ? "content" : "service",
    href: myHref,
    label,
    note: parts.join("、"),
  };
}

export async function getDeliveryOverviewForPlans(
  planIds: string[],
  userId?: string,
  // Internal authoring callers must authorize an administrator before opting in.
  options: { includeUnpublished?: boolean } = {},
): Promise<Map<string, DeliveryOverview>> {
  const uniquePlanIds = [...new Set(planIds)].filter(Boolean);
  const overviews = new Map<string, DeliveryOverview>();

  if (uniquePlanIds.length === 0) return overviews;

  // Fetch plan slugs once; without these, hrefs would always fall back to UUID.
  const planRefs = await db
    .select({ id: plans.id, slug: plans.slug })
    .from(plans)
    .where(inArray(plans.id, uniquePlanIds));
  const slugByPlanId = new Map(planRefs.map((p) => [p.id, p.slug]));

  for (const planId of uniquePlanIds) {
    overviews.set(planId, emptyOverview(planId, slugByPlanId.get(planId) ?? null));
  }

  const [courseRows, contentRows, serviceRows] = await Promise.all([
    db
      .select({
        id: courses.id,
        planId: planCourses.planId,
        title: courses.title,
        description: courses.description,
        image: courses.image,
        lessonCount: count(lessons.id),
      })
      .from(planCourses)
      .innerJoin(courses, eq(planCourses.courseId, courses.id))
      .leftJoin(lessons, and(
        eq(courses.id, lessons.courseId),
        isNull(lessons.deletedAt),
        options.includeUnpublished ? undefined : eq(lessons.status, "published"),
      ))
      .where(and(
        inArray(planCourses.planId, uniquePlanIds),
        isNull(planCourses.removedAt),
        isNull(courses.deletedAt),
        options.includeUnpublished ? undefined : eq(courses.status, "published"),
      ))
      .groupBy(courses.id, planCourses.planId)
      .orderBy(asc(courses.sortOrder)),
    db
      .select({
        id: planContents.id,
        planId: planContents.planId,
        title: planContents.title,
        type: planContents.type,
        sortOrder: planContents.sortOrder,
      })
      .from(planContents)
      .where(and(inArray(planContents.planId, uniquePlanIds), isNull(planContents.deletedAt)))
      .orderBy(asc(planContents.sortOrder)),
    db
      .select({
        id: serviceConfigs.id,
        planId: serviceConfigs.planId,
        serviceName: serviceConfigs.serviceName,
        isActive: serviceConfigs.isActive,
      })
      .from(serviceConfigs)
      .where(and(inArray(serviceConfigs.planId, uniquePlanIds), isNull(serviceConfigs.deletedAt))),
  ]);

  const courseIds = courseRows.map((course) => course.id);
  const completedByCourse = new Map<string, number>();

  if (userId && courseIds.length > 0) {
    const lessonRows = await db
      .select({
        id: lessons.id,
        courseId: lessons.courseId,
      })
      .from(lessons)
      .where(and(
        inArray(lessons.courseId, courseIds),
        isNull(lessons.deletedAt),
        options.includeUnpublished ? undefined : eq(lessons.status, "published"),
      ));

    const lessonToCourse = new Map(lessonRows.map((lesson) => [lesson.id, lesson.courseId]));
    const lessonIds = lessonRows.map((lesson) => lesson.id);

    if (lessonIds.length > 0) {
      const completedRows = await db
        .select({ lessonId: userProgress.lessonId })
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, userId),
            inArray(userProgress.lessonId, lessonIds),
            eq(userProgress.completed, true),
          ),
        );

      for (const row of completedRows) {
        const courseId = lessonToCourse.get(row.lessonId);
        if (!courseId) continue;
        completedByCourse.set(courseId, (completedByCourse.get(courseId) ?? 0) + 1);
      }
    }
  }

  for (const course of courseRows) {
    if (!course.planId) continue;
    const overview = overviews.get(course.planId);
    if (!overview) continue;

    overview.courses.push({
      ...course,
      planId: course.planId,
      lessonCount: Number(course.lessonCount),
      completedLessonCount: completedByCourse.get(course.id) ?? 0,
    });
  }

  for (const content of contentRows) {
    const overview = overviews.get(content.planId);
    if (!overview) continue;
    overview.contents.push(content);
  }

  for (const service of serviceRows) {
    const overview = overviews.get(service.planId);
    if (!overview) continue;
    overview.services.push(service);
  }

  for (const [planId, overview] of overviews) {
    const lessonCount = overview.courses.reduce((sum, course) => sum + course.lessonCount, 0);
    const completedLessonCount = overview.courses.reduce(
      (sum, course) => sum + course.completedLessonCount,
      0,
    );
    const activeServiceCount = overview.services.filter((service) => service.isActive).length;

    const finalOverview: DeliveryOverview = {
      ...overview,
      courseCount: overview.courses.length,
      lessonCount,
      completedLessonCount,
      contentCount: overview.contents.length,
      serviceCount: overview.services.length,
      activeServiceCount,
      hasDelivery: overview.courses.length > 0 || overview.contents.length > 0 || activeServiceCount > 0,
      primaryAction: buildPrimaryAction({
        ...overview,
        courseCount: overview.courses.length,
        lessonCount,
        completedLessonCount,
        contentCount: overview.contents.length,
        serviceCount: overview.services.length,
        activeServiceCount,
      }),
    };

    overviews.set(planId, finalOverview);
  }

  return overviews;
}

export async function getDeliveryOverviewForPlan(
  planId: string,
  userId?: string,
  options: { includeUnpublished?: boolean } = {},
) {
  const overviews = await getDeliveryOverviewForPlans([planId], userId, options);
  return overviews.get(planId) ?? emptyOverview(planId);
}
