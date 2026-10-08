import "server-only";

import { db } from "@/lib/db";
import { courses, planCourses, lessons, planPresentations } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { validateCourseReadiness, type ValidationResult } from "@/lib/course-validation";
import { createRevision } from "@/lib/versioning";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";
import {
  domainFailure,
  domainSuccess,
  type DomainActor,
  type DomainFailure,
  type DomainResult,
} from "@/lib/services/library-skill-information-domain";

const logger = createLogger("course-publish");

interface StepResult {
  step: string;
  status: "done" | "failed" | "skipped";
  error?: string;
}

export interface PublishActor {
  type: "user" | "agent";
  id: string;
}

export interface PublishResult {
  success: boolean;
  steps: StepResult[];
  validation: ValidationResult;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PublishedCourseResult {
  course: typeof courses.$inferSelect;
  linkedPlanIds: string[];
}

export async function publishCourseInTransaction(
  tx: DbTransaction,
  input: {
    courseId: string;
    now: Date;
  },
): Promise<DomainResult<PublishedCourseResult>> {
  await tx.execute(sql`select ${courses.id} from ${courses} where ${courses.id} = ${input.courseId} for update`);
  const current = await tx.query.courses.findFirst({
    where: and(eq(courses.id, input.courseId), isNull(courses.deletedAt)),
  });
  if (!current) return domainFailure("not-found", "Course not found");
  const draftLesson = await tx.query.lessons.findFirst({
    where: and(
      eq(lessons.courseId, input.courseId),
      eq(lessons.status, "draft"),
      isNull(lessons.deletedAt),
    ),
    columns: { id: true },
  });
  if (current.status !== "draft" && (current.status !== "published" || !draftLesson)) {
    return domainFailure("invalid-transition", `Cannot publish Course from ${current.status}`);
  }

  await tx
    .update(lessons)
    .set({ status: "published", updatedAt: input.now })
    .where(and(
      eq(lessons.courseId, input.courseId),
      eq(lessons.status, "draft"),
      isNull(lessons.deletedAt),
    ));

  const [course] = await tx
    .update(courses)
    .set({ status: "published", updatedAt: input.now })
    .where(and(
      eq(courses.id, input.courseId),
      eq(courses.status, current.status),
      isNull(courses.deletedAt),
    ))
    .returning();
  if (!course) return domainFailure("stale-revision", "Course changed while publishing");

  const linkedPlans = await tx
    .select({ planId: planCourses.planId })
    .from(planCourses)
    .where(and(eq(planCourses.courseId, input.courseId), isNull(planCourses.removedAt)));
  for (const { planId } of linkedPlans) {
    await tx
      .update(planPresentations)
      .set({ publishedAt: input.now, updatedAt: input.now })
      .where(and(
        eq(planPresentations.planId, planId),
        isNull(planPresentations.publishedAt),
        isNull(planPresentations.deletedAt),
      ));
  }

  return domainSuccess({ course, linkedPlanIds: linkedPlans.map(({ planId }) => planId) });
}

export async function finalizeCoursePublication(
  courseId: string,
  actor: DomainActor,
  linkedPlanIds: string[],
): Promise<void> {
  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id,
    action: "publish",
    entityType: "course",
    entityId: courseId,
    metadata: { atomic: true },
  });
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
  for (const planId of linkedPlanIds) {
    revalidatePath(`/admin/plans/${planId}`);
    revalidatePath(`/products/${planId}`);
  }
  revalidatePath("/");
  expirePublicSiteCache("plans");
  logger.info("Course bundle published", { courseId });
}

class CoursePublishAbort extends Error {
  constructor(readonly failure: DomainFailure) {
    super(failure.message);
  }
}

/**
 * Publish a course bundle atomically using a DB transaction:
 * 1. Validate readiness
 * 2. Create revisions for rollback
 * 3. (In transaction) Set all lessons to published + course to published + presentation publishedAt
 * 4. Write audit log
 */
export async function publishCourseBundle(
  courseId: string,
  actor: PublishActor,
): Promise<PublishResult> {
  const steps: StepResult[] = [];

  // Step 1: Validate
  const validation = await validateCourseReadiness(courseId);
  if (!validation.ready) {
    steps.push({
      step: "validate",
      status: "failed",
      error: `${validation.issues.filter((i) => i.severity === "error").length} 個必要項目未完成`,
    });
    return { success: false, steps, validation };
  }
  steps.push({ step: "validate", status: "done" });

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) {
    steps.push({ step: "load_course", status: "failed", error: "課程不存在" });
    return { success: false, steps, validation };
  }

  // Step 2: Create revisions (non-blocking, outside transaction)
  try {
    const allLessons = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)));

    for (const lesson of allLessons) {
      await createRevision("lesson", lesson.id, lesson as unknown as Record<string, unknown>, actor.id, "pre-publish snapshot");
    }
    await createRevision("course", courseId, course as unknown as Record<string, unknown>, actor.id, "pre-publish snapshot");
    steps.push({ step: "create_revisions", status: "done" });
  } catch (err) {
    steps.push({ step: "create_revisions", status: "failed", error: (err as Error).message });
  }

  // Step 3: Atomic publish — all DB writes in a single transaction
  let published: PublishedCourseResult;
  try {
    published = await db.transaction(async (tx) => {
      const result = await publishCourseInTransaction(tx, {
        courseId,
        now: new Date(),
      });
      if (!result.ok) throw new CoursePublishAbort(result);
      return result.value;
    });

    steps.push({ step: "publish_transaction", status: "done" });
  } catch (err) {
    steps.push({ step: "publish_transaction", status: "failed", error: (err as Error).message });
    return { success: false, steps, validation };
  }

  // Step 4: Side effects run only after commit.
  await finalizeCoursePublication(courseId, actor, published.linkedPlanIds);
  steps.push({ step: "audit_log", status: "done" });
  return { success: true, steps, validation };
}
