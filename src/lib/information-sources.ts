import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { findAgentOperation, resolveInformationActionOperation } from "@/lib/agent/action-resolver";
import { db } from "@/lib/db";
import {
  agentInformationItems,
  chapters,
  courses,
  lessons,
  libraryEntries,
  skillReleases,
  type AgentInformationAction,
} from "@/lib/db/schema";
import {
  domainFailure,
  domainSuccess,
  informationKindSource,
  type DomainResult,
  type InformationKind,
  type ReadinessIssue,
} from "@/lib/services/library-skill-information-domain";

export type InformationSourceType = "manual_announcement" | "library_entry" | "skill_release" | "course" | "api_operation";
export type InformationAudience = "all_users" | "source_entitled";

export interface InformationSourceBundle {
  sourceType: InformationSourceType;
  sourceId: string;
  sourceVersion: string;
  title: string;
  summary: string;
  allowedKinds: InformationKind[];
  audience: InformationAudience;
  sourceStatus: string;
  requiresBundlePublish: boolean;
  requiresAction?: boolean;
  actionTemplates: AgentInformationAction[];
  issues: ReadinessIssue[];
}

type InformationSourceDatabase = Pick<typeof db, "query">;

function manualAnnouncementBundle(sourceId: string): DomainResult<InformationSourceBundle> {
  return domainSuccess({
    sourceType: "manual_announcement",
    sourceId,
    sourceVersion: "1",
    title: "Manual announcement",
    summary: "",
    allowedKinds: ["manual.announcement"],
    audience: "all_users",
    sourceStatus: "available",
    requiresBundlePublish: false,
    requiresAction: false,
    actionTemplates: [],
    issues: [],
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export async function calculateCourseMaterialFingerprint(
  sourceId: string,
  database: InformationSourceDatabase = db,
): Promise<DomainResult<string>> {
  const course = await database.query.courses.findFirst({
    where: and(eq(courses.id, sourceId), isNull(courses.deletedAt)),
  });
  if (!course) return domainFailure("not-found", "Course not found");
  const activeChapters = await database.query.chapters.findMany({
    where: and(eq(chapters.courseId, sourceId), isNull(chapters.deletedAt)),
  });
  const activeLessons = await database.query.lessons.findMany({
    where: and(eq(lessons.courseId, sourceId), isNull(lessons.deletedAt)),
  });

  const activeChapterIds = new Set(activeChapters.map((chapter) => chapter.id));
  const material = {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      image: course.image,
    },
    chapters: activeChapters
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        defaultExpanded: chapter.defaultExpanded,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    lessons: activeLessons
      .filter((lesson) => activeChapterIds.has(lesson.chapterId))
      .map((lesson) => ({
        id: lesson.id,
        chapterId: lesson.chapterId,
        title: lesson.title,
        type: lesson.type,
        content: lesson.content,
        resources: canonicalize(lesson.resourcesJson),
        duration: lesson.duration,
        isPreview: lesson.isPreview,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(material))
    .digest("hex");
  return domainSuccess(`course-material:${digest}`);
}

function brokenAction(field: string, message: string): ReadinessIssue {
  return { code: "broken_action", field, severity: "error", message };
}

function actionFromOperation(
  rel: string,
  operationId: string,
  parameters: AgentInformationAction["parameters"],
): AgentInformationAction | null {
  const operation = resolveInformationActionOperation(operationId);
  if (!operation || operation.credential === "agent") return null;
  return { rel, operationId, parameters, credential: operation.credential };
}

async function libraryBundle(sourceId: string): Promise<DomainResult<InformationSourceBundle>> {
  const row = await db.query.libraryEntries.findFirst({ where: eq(libraryEntries.id, sourceId) });
  if (!row) return domainFailure("not-found", "Library entry not found");

  const discoveredOperation = findAgentOperation({
    method: "get",
    path: "/api/agent/public/v1/library/{idOrSlug}",
    credential: "none",
  });
  const operation = discoveredOperation?.operationId === "getPublicLibraryEntry"
    ? discoveredOperation
    : null;
  const action = operation
    ? actionFromOperation("library-entry", operation.operationId, { idOrSlug: row.slug })
    : null;
  return domainSuccess({
    sourceType: "library_entry",
    sourceId: row.id,
    sourceVersion: String(row.status === "draft" ? row.revision + 1 : row.revision),
    title: row.title,
    summary: row.summary,
    allowedKinds: ["library.published", "library.updated"],
    audience: "all_users",
    sourceStatus: row.status,
    requiresBundlePublish: true,
    actionTemplates: action ? [action] : [],
    issues: action ? [] : [brokenAction("actions", "Public Library detail operation is not registered in the current OpenAPI document")],
  });
}

async function skillReleaseBundle(sourceId: string): Promise<DomainResult<InformationSourceBundle>> {
  const row = await db.query.skillReleases.findFirst({
    where: eq(skillReleases.id, sourceId),
    with: { skill: true },
  });
  if (!row) return domainFailure("not-found", "Skill release not found");

  if (row.skill.distributionMode === "github") {
    const operation = findAgentOperation({
      method: "get",
      path: "/api/agent/public/v1/skills/{idOrSlug}",
      credential: "none",
    });
    const action = operation?.operationId === "getPublicSkill"
      ? actionFromOperation("skill", operation.operationId, { idOrSlug: row.skill.slug })
      : null;
    return domainSuccess({
      sourceType: "skill_release",
      sourceId: row.id,
      sourceVersion: row.skill.sourceCommitSha ?? row.skill.sourceRef ?? row.id,
      title: row.skill.title,
      summary: row.skill.summary,
      allowedKinds: [row.status === "deprecated" ? "skill.deprecated" : "skill.released"],
      audience: "all_users",
      sourceStatus: row.status,
      requiresBundlePublish: true,
      actionTemplates: action ? [action] : [],
      issues: action ? [] : [brokenAction("actions", "Public Skill detail operation is not registered in the current OpenAPI document")],
    });
  }

  const credential = row.accessPolicy === "public" ? "none" : "user";
  const path = row.accessPolicy === "public"
    ? "/api/agent/public/v1/skills/{idOrSlug}/releases/{version}"
    : "/api/agent/user/v1/skills/{id}/releases/{version}";
  const expectedOperationId = row.accessPolicy === "public"
    ? "getPublicSkillRelease"
    : "getUserSkillRelease";
  const discoveredOperation = findAgentOperation({ method: "get", path, credential });
  const operation = discoveredOperation?.operationId === expectedOperationId
    ? discoveredOperation
    : null;
  const action = operation
    ? actionFromOperation("skill-release", operation.operationId, {
        [row.accessPolicy === "public" ? "idOrSlug" : "id"]: row.skill.slug,
        version: row.version,
      })
    : null;
  return domainSuccess({
    sourceType: "skill_release",
    sourceId: row.id,
    sourceVersion: row.version,
    title: `${row.skill.title} ${row.version}`,
    summary: row.skill.summary,
    allowedKinds: [row.status === "deprecated" ? "skill.deprecated" : "skill.released"],
    audience: "all_users",
    sourceStatus: row.status,
    requiresBundlePublish: true,
    actionTemplates: action ? [action] : [],
    issues: action ? [] : [brokenAction("actions", "Matching Skill release operation is not registered in the current OpenAPI document")],
  });
}

async function courseBundle(sourceId: string, kind: InformationKind = "course.published"): Promise<DomainResult<InformationSourceBundle>> {
  const [row, fingerprint] = await Promise.all([
    db.query.courses.findFirst({
      where: and(eq(courses.id, sourceId), isNull(courses.deletedAt)),
    }),
    calculateCourseMaterialFingerprint(sourceId),
  ]);
  if (!row) return domainFailure("not-found", "Course not found");
  if (!fingerprint.ok) return fingerprint;
  if (kind === "course.announced") {
    return domainSuccess({
      sourceType: "course",
      sourceId: row.id,
      sourceVersion: `course-announcement:${row.updatedAt.toISOString()}`,
      title: row.title,
      summary: row.description ?? row.title,
      allowedKinds: ["course.announced"],
      audience: "all_users",
      sourceStatus: row.status,
      requiresBundlePublish: false,
      requiresAction: false,
      actionTemplates: [],
      issues: [],
    });
  }
  const action = actionFromOperation("course-content", "getUserCourseContent", { id: row.id });
  return domainSuccess({
    sourceType: "course",
    sourceId: row.id,
    sourceVersion: fingerprint.value,
    title: row.title,
    summary: row.description ?? row.title,
    allowedKinds: ["course.published"],
    audience: "source_entitled",
    sourceStatus: row.status,
    requiresBundlePublish: true,
    actionTemplates: action ? [action] : [],
    issues: action ? [] : [brokenAction("actions", "Course content operation is unavailable")],
  });
}

async function apiOperationBundle(operationId: string): Promise<DomainResult<InformationSourceBundle>> {
  const operation = resolveInformationActionOperation(operationId);
  if (!operation) return domainFailure("not-found", "User-facing OpenAPI operation not found");
  if (operation.credential === "agent") {
    return domainFailure("not-found", "User-facing OpenAPI operation not found");
  }
  const required = operation.parameters.filter((parameter) => parameter.required);
  const issues = required.length === 0
    ? []
    : [brokenAction("actions.parameters", "API capability source requires server-bound parameters before it can be published")];
  return domainSuccess({
    sourceType: "api_operation",
    sourceId: operation.operationId,
    sourceVersion: JSON.stringify({
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      credential: operation.credential,
      scope: operation.requiredScope,
    }),
    title: operation.operationId,
    summary: `${operation.method.toUpperCase()} ${operation.path}`,
    allowedKinds: ["api.capability-added"],
    audience: "all_users",
    sourceStatus: "available",
    requiresBundlePublish: false,
    actionTemplates: required.length === 0
      ? [{
          rel: "api-capability",
          operationId: operation.operationId,
          parameters: {},
          credential: operation.credential === "user" ? "user" : "none",
        }]
      : [],
    issues,
  });
}

export async function buildInformationSourceBundle(
  sourceType: InformationSourceType,
  sourceId: string,
  options: { kind?: InformationKind } = {},
): Promise<DomainResult<InformationSourceBundle>> {
  switch (sourceType) {
    case "manual_announcement": return manualAnnouncementBundle(sourceId);
    case "library_entry": return libraryBundle(sourceId);
    case "skill_release": return skillReleaseBundle(sourceId);
    case "course": return courseBundle(sourceId, options.kind);
    case "api_operation": return apiOperationBundle(sourceId);
  }
}

export function validateInformationKindSource(kind: InformationKind, sourceType: InformationSourceType): boolean {
  return informationKindSource[kind] === sourceType;
}

export async function hasPublishedInformationForDedupeKey(dedupeKey: string, excludeId?: string): Promise<boolean> {
  const row = await db.query.agentInformationItems.findFirst({
    where: and(
      eq(agentInformationItems.dedupeKey, dedupeKey),
      eq(agentInformationItems.status, "published"),
    ),
    columns: { id: true },
  });
  return Boolean(row && row.id !== excludeId);
}
