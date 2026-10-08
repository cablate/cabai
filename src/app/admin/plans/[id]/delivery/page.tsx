import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { plans, planPresentations, courses, planCourses, planContents, serviceConfigs } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getPlanDeliveryStatus } from "@/lib/plan-delivery-status";
import type { Plan, PlanPresentation, Course, PlanContent, ServiceConfig } from "@/lib/db/schema";
import DeliveryBuilder from "./delivery-builder";
import { PlanTabs } from "../_components/plan-tabs";

interface PageParams {
  id: string;
}

export default async function DeliveryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  // Await params per Next.js 15+ pattern
  const { id: planId } = await params;

  // 1. Fetch plan
  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (planResult.length === 0) {
    notFound();
  }

  const plan: Plan = planResult[0]!;

  // 2. Fetch presentation (optional)
  const presentationResult = await db
    .select()
    .from(planPresentations)
    .where(eq(planPresentations.planId, planId))
    .limit(1);

  const presentation: PlanPresentation | null =
    presentationResult.length > 0 ? presentationResult[0]! : null;

  // 3. Fetch delivery status
  const deliveryStatus = await getPlanDeliveryStatus(planId);

  // 4. Fetch courses via junction table
  const courseRows = await db
    .select({
      id: courses.id,
      title: courses.title,
      description: courses.description,
      image: courses.image,
      sortOrder: courses.sortOrder,
      status: courses.status,
      deletedAt: courses.deletedAt,
      deletedBy: courses.deletedBy,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
    })
    .from(planCourses)
    .innerJoin(courses, eq(planCourses.courseId, courses.id))
    .where(and(eq(planCourses.planId, planId), isNull(planCourses.removedAt)));
  const courseList = courseRows as Course[];

  // 5. Fetch plan contents
  const contentList: PlanContent[] = await db
    .select()
    .from(planContents)
    .where(and(eq(planContents.planId, planId), isNull(planContents.deletedAt)));

  // 6. Fetch service configs
  const serviceList: ServiceConfig[] = await db
    .select()
    .from(serviceConfigs)
    .where(and(eq(serviceConfigs.planId, planId), isNull(serviceConfigs.deletedAt)));

  // 7. Fetch all available courses (not deleted) for the picker
  const allCourses = await db
    .select({ id: courses.id, title: courses.title, status: courses.status })
    .from(courses)
    .where(isNull(courses.deletedAt))
    .orderBy(courses.title);

  // IDs of courses already in this plan
  const linkedCourseIds = new Set(courseList.map((c) => c.id));

  const availableCourses = allCourses
    .filter((c) => !linkedCourseIds.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, status: c.status }));

  // 8. Render delivery builder
  return (
    <div className="space-y-6">
      <PlanTabs planId={planId} activeTab="delivery" />
      <DeliveryBuilder
        planId={plan.id}
        planName={presentation?.title || plan.name}
        offeringType={presentation?.offeringType || "course"}
        deliveryStatus={deliveryStatus}
        courses={courseList}
        availableCourses={availableCourses}
        contents={contentList}
        services={serviceList}
      />
    </div>
  );
}
