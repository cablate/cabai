import { db } from "@/lib/db";
import {
  publishLibraryEntryInTransaction,
  type LibraryEntry,
} from "@/lib/services/library-service";
import {
  publishSkillReleaseInTransaction,
  type PublishedSkillReleaseResult,
} from "@/lib/services/skill-release-service";
import { getSkillReleaseArtifactPrerequisites } from "@/lib/services/skill-artifact-service";
import {
  finalizeCoursePublication,
  publishCourseInTransaction,
  type PublishedCourseResult,
} from "@/lib/course-publish";
import { validateCourseReadiness } from "@/lib/course-validation";
import {
  calculateCourseMaterialFingerprint,
} from "@/lib/information-sources";
import {
  transitionInformationInTransaction,
  validateInformationReadiness,
} from "@/lib/services/information-service";
import {
  agentInformationEvents,
  agentInformationItems,
  courses,
  libraryEntries,
  planCourses,
  skillReleases,
  skills,
} from "@/lib/db/schema";
import {
  domainFailure,
  domainSuccess,
  type DomainActor,
  type DomainFailure,
  type DomainResult,
} from "./library-skill-information-domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { StorageProvider } from "@/lib/storage/types";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";

class BundleAbort extends Error {
  constructor(readonly failure: DomainFailure) {
    super(failure.message);
  }
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) throw new BundleAbort(result);
  return result.value;
}

export interface PublishedLibraryInformationBundle {
  library: LibraryEntry;
  information: typeof agentInformationItems.$inferSelect;
}

type LibraryBundleInput = {
  libraryId: string;
  expectedLibraryRevision: number;
  informationId: string;
  expectedInformationRevision: number;
  actor: DomainActor;
  idempotencyKey: string;
};

async function replayLibraryBundle(input: LibraryBundleInput): Promise<DomainResult<PublishedLibraryInformationBundle> | null> {
  const event = await db.query.agentInformationEvents.findFirst({
    where: eq(agentInformationEvents.idempotencyKey, input.idempotencyKey),
  });
  if (!event) return null;
  if (event.informationId !== input.informationId || event.toStatus !== "published") {
    return domainFailure("conflict", "Idempotency key was already used for a different transition");
  }
  const [library, information] = await Promise.all([
    db.query.libraryEntries.findFirst({ where: eq(libraryEntries.id, input.libraryId) }),
    db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) }),
  ]);
  return library?.status === "published"
    && library.revision === input.expectedLibraryRevision + 1
    && information?.status === "published"
    ? domainSuccess({ library, information })
    : domainFailure("conflict", "Existing bundle event does not match current Library state");
}

export async function publishLibraryInformationBundle(input: LibraryBundleInput): Promise<DomainResult<PublishedLibraryInformationBundle>> {
  const replay = await replayLibraryBundle(input);
  if (replay) {
    if (replay.ok) expirePublicSiteCache("library");
    return replay;
  }
  const information = await db.query.agentInformationItems.findFirst({
    where: eq(agentInformationItems.id, input.informationId),
  });
  if (!information) return domainFailure("not-found", "Information not found");
  if (information.sourceType !== "library_entry" || information.sourceId !== input.libraryId) {
    return domainFailure("conflict", "Information does not belong to this Library entry");
  }
  if (information.sourceVersion !== String(input.expectedLibraryRevision + 1)) {
    return domainFailure("stale-revision", "Information targets a different Library revision");
  }
  const readiness = await validateInformationReadiness(input.informationId, {
    allowBundleSource: { sourceType: "library_entry", sourceId: input.libraryId },
  });
  if (!readiness.ok) return readiness;
  if (!readiness.value.ready) {
    return domainFailure("validation-failed", "Information is not ready to publish", { issues: readiness.value.issues });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const library = unwrap(await publishLibraryEntryInTransaction(tx, {
        id: input.libraryId,
        expectedRevision: input.expectedLibraryRevision,
      }));
      const publishedInformation = unwrap(await transitionInformationInTransaction(tx, {
        informationId: input.informationId,
        expectedRevision: input.expectedInformationRevision,
        toStatus: "published",
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        now: new Date(),
      }));
      return domainSuccess({ library, information: publishedInformation });
    });
    expirePublicSiteCache("library");
    return result;
  } catch (error) {
    if (error instanceof BundleAbort) {
      const concurrentReplay = await replayLibraryBundle(input);
      if (concurrentReplay?.ok) expirePublicSiteCache("library");
      return concurrentReplay ?? error.failure;
    }
    throw error;
  }
}

export interface PublishedSkillInformationBundle extends PublishedSkillReleaseResult {
  information: typeof agentInformationItems.$inferSelect;
}

type SkillBundleInput = {
  skillId: string;
  releaseId: string;
  expectedSkillRevision: number;
  expectedReleaseRevision: number;
  informationId: string;
  expectedInformationRevision: number;
  actor: DomainActor;
  idempotencyKey: string;
};

async function replaySkillBundle(input: SkillBundleInput): Promise<DomainResult<PublishedSkillInformationBundle> | null> {
  const event = await db.query.agentInformationEvents.findFirst({
    where: eq(agentInformationEvents.idempotencyKey, input.idempotencyKey),
  });
  if (!event) return null;
  if (event.informationId !== input.informationId || event.toStatus !== "published") {
    return domainFailure("conflict", "Idempotency key was already used for a different transition");
  }
  const [skill, release, information] = await Promise.all([
    db.query.skills.findFirst({ where: eq(skills.id, input.skillId) }),
    db.query.skillReleases.findFirst({ where: eq(skillReleases.id, input.releaseId) }),
    db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) }),
  ]);
  return skill?.status === "published"
    && skill.currentReleaseId === input.releaseId
    && release?.status === "published"
    && information?.status === "published"
    ? domainSuccess({ skill, release, information })
    : domainFailure("conflict", "Existing bundle event does not match current Skill state");
}

export async function publishSkillInformationBundle(
  input: SkillBundleInput,
  storage?: StorageProvider,
): Promise<DomainResult<PublishedSkillInformationBundle>> {
  const replay = await replaySkillBundle(input);
  if (replay) {
    if (replay.ok) expirePublicSiteCache("skills");
    return replay;
  }
  const information = await db.query.agentInformationItems.findFirst({
    where: eq(agentInformationItems.id, input.informationId),
  });
  if (!information) return domainFailure("not-found", "Information not found");
  if (
    information.sourceType !== "skill_release"
    || information.sourceId !== input.releaseId
  ) return domainFailure("conflict", "Information does not belong to this Skill release");

  const parentSkill = await db.query.skills.findFirst({
    where: eq(skills.id, input.skillId),
    columns: { distributionMode: true },
  });
  const artifact = parentSkill?.distributionMode === "github"
    ? domainSuccess(undefined)
    : await getSkillReleaseArtifactPrerequisites(input.releaseId, storage);
  if (!artifact.ok) return artifact;

  const readiness = await validateInformationReadiness(input.informationId, {
    allowBundleSource: { sourceType: "skill_release", sourceId: input.releaseId },
  });
  if (!readiness.ok) return readiness;
  if (!readiness.value.ready) {
    return domainFailure("validation-failed", "Information is not ready to publish", { issues: readiness.value.issues });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const published = unwrap(await publishSkillReleaseInTransaction(tx, {
        skillId: input.skillId,
        releaseId: input.releaseId,
        expectedSkillRevision: input.expectedSkillRevision,
        expectedReleaseRevision: input.expectedReleaseRevision,
      }, artifact.value));
      const publishedInformation = unwrap(await transitionInformationInTransaction(tx, {
        informationId: input.informationId,
        expectedRevision: input.expectedInformationRevision,
        toStatus: "published",
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        now: new Date(),
      }));
      return domainSuccess({ ...published, information: publishedInformation });
    });
    expirePublicSiteCache("skills");
    return result;
  } catch (error) {
    if (error instanceof BundleAbort) {
      const concurrentReplay = await replaySkillBundle(input);
      if (concurrentReplay?.ok) expirePublicSiteCache("skills");
      return concurrentReplay ?? error.failure;
    }
    throw error;
  }
}

export interface PublishedCourseInformationBundle extends PublishedCourseResult {
  information: typeof agentInformationItems.$inferSelect;
}

type CourseBundleInput = {
  courseId: string;
  sourceVersion: string;
  informationId: string;
  expectedInformationRevision: number;
  actor: DomainActor;
  idempotencyKey: string;
};

async function replayCourseBundle(
  input: CourseBundleInput,
): Promise<DomainResult<PublishedCourseInformationBundle> | null> {
  const event = await db.query.agentInformationEvents.findFirst({
    where: eq(agentInformationEvents.idempotencyKey, input.idempotencyKey),
  });
  if (!event) return null;
  if (event.informationId !== input.informationId || event.toStatus !== "published") {
    return domainFailure("conflict", "Idempotency key was already used for a different transition");
  }
  const [course, information, linkedPlans] = await Promise.all([
    db.query.courses.findFirst({ where: eq(courses.id, input.courseId) }),
    db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) }),
    db.select({ planId: planCourses.planId }).from(planCourses).where(and(
      eq(planCourses.courseId, input.courseId),
      isNull(planCourses.removedAt),
    )),
  ]);
  if (
    course?.status !== "published"
    || information?.status !== "published"
    || information.sourceType !== "course"
    || information.sourceId !== input.courseId
    || information.sourceVersion !== input.sourceVersion
    || information.revision !== input.expectedInformationRevision + 1
  ) return domainFailure("conflict", "Existing bundle event does not match current Course state");
  return domainSuccess({ course, information, linkedPlanIds: linkedPlans.map(({ planId }) => planId) });
}

export async function publishCourseInformationBundle(
  input: CourseBundleInput,
): Promise<DomainResult<PublishedCourseInformationBundle>> {
  const replay = await replayCourseBundle(input);
  if (replay) {
    if (replay.ok) expirePublicSiteCache("plans");
    return replay;
  }

  const information = await db.query.agentInformationItems.findFirst({
    where: eq(agentInformationItems.id, input.informationId),
  });
  if (!information) return domainFailure("not-found", "Information not found");
  if (information.sourceType !== "course" || information.sourceId !== input.courseId) {
    return domainFailure("conflict", "Information does not belong to this Course");
  }

  const [courseReadiness, informationReadiness] = await Promise.all([
    validateCourseReadiness(input.courseId),
    validateInformationReadiness(input.informationId, {
      allowBundleSource: { sourceType: "course", sourceId: input.courseId },
      deferSourceVersionCheck: true,
    }),
  ]);
  if (!courseReadiness.ready) {
    return domainFailure("validation-failed", "Course is not ready to publish");
  }
  if (!informationReadiness.ok) return informationReadiness;
  if (!informationReadiness.value.ready) {
    return domainFailure("validation-failed", "Information is not ready to publish", {
      issues: informationReadiness.value.issues,
    });
  }

  try {
    const published = await db.transaction(async (tx) => {
      await tx.execute(sql`select ${courses.id} from ${courses} where ${courses.id} = ${input.courseId} for update`);
      await tx.execute(sql`select ${agentInformationItems.id} from ${agentInformationItems} where ${agentInformationItems.id} = ${input.informationId} for update`);
      const transactionReplay = await tx.query.agentInformationEvents.findFirst({
        where: eq(agentInformationEvents.idempotencyKey, input.idempotencyKey),
      });
      if (transactionReplay) {
        if (transactionReplay.informationId !== input.informationId || transactionReplay.toStatus !== "published") {
          throw new BundleAbort(domainFailure("conflict", "Idempotency key was already used for a different transition"));
        }
        const [replayedCourse, replayedInformation, replayedPlans] = await Promise.all([
          tx.query.courses.findFirst({ where: eq(courses.id, input.courseId) }),
          tx.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) }),
          tx.select({ planId: planCourses.planId }).from(planCourses).where(and(
            eq(planCourses.courseId, input.courseId),
            isNull(planCourses.removedAt),
          )),
        ]);
        if (
          !replayedCourse
          || replayedCourse.status !== "published"
          || !replayedInformation
          || replayedInformation.status !== "published"
          || replayedInformation.sourceVersion !== input.sourceVersion
          || replayedInformation.revision !== input.expectedInformationRevision + 1
        ) {
          throw new BundleAbort(domainFailure("conflict", "Existing bundle event does not match current Course state"));
        }
        return {
          course: replayedCourse,
          information: replayedInformation,
          linkedPlanIds: replayedPlans.map(({ planId }) => planId),
        };
      }
      const transactionInformation = await tx.query.agentInformationItems.findFirst({
        where: eq(agentInformationItems.id, input.informationId),
      });
      if (!transactionInformation) throw new BundleAbort(domainFailure("not-found", "Information not found"));
      if (transactionInformation.sourceType !== "course" || transactionInformation.sourceId !== input.courseId) {
        throw new BundleAbort(domainFailure("conflict", "Information does not belong to this Course"));
      }
      const fingerprint = unwrap(await calculateCourseMaterialFingerprint(input.courseId, tx));
      if (
        fingerprint !== input.sourceVersion
        || transactionInformation.sourceVersion !== input.sourceVersion
      ) {
        throw new BundleAbort(domainFailure("stale-revision", "Course material changed before publication"));
      }
      const course = unwrap(await publishCourseInTransaction(tx, {
        courseId: input.courseId,
        now: new Date(),
      }));
      const publishedInformation = unwrap(await transitionInformationInTransaction(tx, {
        informationId: input.informationId,
        expectedRevision: input.expectedInformationRevision,
        toStatus: "published",
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        now: new Date(),
      }));
      return { ...course, information: publishedInformation };
    });
    await finalizeCoursePublication(input.courseId, input.actor, published.linkedPlanIds);
    return domainSuccess(published);
  } catch (error) {
    if (error instanceof BundleAbort) {
      const concurrentReplay = await replayCourseBundle(input);
      return concurrentReplay ?? error.failure;
    }
    throw error;
  }
}
