import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  type RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { stringify as stringifyYaml } from "yaml";
import {
  chapterCreateSchema,
  chapterUpdateSchema,
  courseCreateSchema,
  courseIdSchema,
  courseInformationPublishSchema,
  courseUpdateSchema,
  entityDeleteSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
} from "./content-schemas";
import {
  includeDeletedQuerySchema,
  planContentCreateSchema,
  planContentPathSchema,
  planContentUpdateSchema,
  planCourseBindSchema,
  planCoursePathSchema,
  planCreateSchema,
  planIdPathSchema,
  planPresentationUpdateSchema,
  planServiceCreateSchema,
  planServicePathSchema,
  planServiceUpdateSchema,
  planUpdateSchema,
} from "./plan-schemas";
import {
  grantCreateSchema,
  grantListQuerySchema,
  grantRevokeSchema,
  adminOperationsOverviewResponseSchema,
  mediaCleanupSchema,
  mediaListQuerySchema,
  memberListQuerySchema,
  orderListQuerySchema,
  userCourseContentQuerySchema,
  webhookListQuerySchema,
  webhookRetrySchema,
  webhookRetryResponseSchema,
} from "./operations-schemas";
import {
  providerSyncExecuteSchema,
  providerSyncJobPathSchema,
  providerSyncJobResponseSchema,
  providerSyncPreviewResponseSchema,
} from "./provider-sync-contracts";
import {
  expectedRevisionSchema,
  informationCreateSchema,
  informationListQuerySchema,
  informationPathSchema,
  informationSourceDraftSchema,
  informationTransitionSchema,
  informationUpdateSchema,
  libraryBundlePublishSchema,
  libraryEntryPathSchema,
  skillBundlePublishSchema,
  skillPathSchema,
  skillReleasePathSchema,
} from "./admin-domain-schemas";
import {
  userInformationAckSchema,
  userInformationListQuerySchema,
} from "./user-information-schemas";
import {
  uploadConfirmRequestSchema,
  uploadSignedUrlRequestSchema,
  uploadSignedUrlResponseSchema,
} from "../upload-types";
import {
  libraryPublicDetailSchema,
  libraryPublicSummarySchema,
  publicSkillDetailSchema,
  publicSkillReleaseDetailSchema,
  publicSkillSummarySchema,
  userCourseContentSchema,
  userCourseSummarySchema,
  userInformationAckResponseSchema,
  userInformationDetailSchema,
  userInformationFeedSchema,
} from "./user-response-schemas";
import {
  createLibraryEntrySchema,
  updateLibraryEntrySchema,
} from "../services/library-service";
import {
  createSkillInputSchema,
  createSkillReleaseInputSchema,
  publishSkillReleaseInputSchema,
  updateSkillInputSchema,
  updateSkillReleaseInputSchema,
} from "../services/skill-release-service";

const dataEnvelope = z.object({ data: z.unknown() }).openapi("DataEnvelope");
const successEnvelope = z.object({ success: z.literal(true) }).openapi("SuccessEnvelope");
const uploadApiError = z.object({
  code: z.enum(["UNAUTHORIZED", "INVALID_FILE", "FILE_TOO_LARGE", "INVALID_TYPE", "RATE_LIMIT", "SERVER_ERROR"]),
  message: z.string(),
  field: z.string().optional(),
}).openapi("UploadApiError");
const basicApiError = z.object({ error: z.string() }).openapi("BasicApiError");
const uploadConfirmError = z.object({
  error: z.string(),
  kind: z.enum([
    "not-found",
    "forbidden",
    "conflict",
    "stale-revision",
    "immutable",
    "validation-failed",
    "invalid-transition",
    "prerequisite-unavailable",
  ]).optional(),
  issues: z.array(z.unknown()).optional(),
}).openapi("UploadConfirmError");
const agentMediaRecord = z.object({
  id: z.string(),
  storageKey: z.string(),
  publicUrl: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  context: mediaListQuerySchema.shape.context.unwrap(),
  status: mediaListQuerySchema.shape.status.unwrap(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  uploadedBy: z.string(),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
}).openapi("AgentMediaRecord");
const agentMediaListResponse = z.object({
  data: z.array(agentMediaRecord),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
}).openapi("AgentMediaListResponse");
const errorEnvelope = z.object({
  error: z.string(),
  code: z.enum([
    "EMPTY_JSON_BODY",
    "MALFORMED_JSON",
    "VALIDATION_ERROR",
    "INVALID_QUERY",
    "INVALID_PATH",
    "INVALID_IDEMPOTENCY_KEY",
    "PATH_BODY_MISMATCH",
    "INTERNAL_ERROR",
  ]).optional(),
  kind: z.enum([
    "not-found",
    "forbidden",
    "conflict",
    "stale-revision",
    "immutable",
    "validation-failed",
    "invalid-transition",
    "prerequisite-unavailable",
  ]).optional(),
  details: z.unknown().optional(),
  issues: z.unknown().optional(),
  retryable: z.boolean().optional(),
}).openapi("ErrorEnvelope");

const jsonBody = (schema: z.ZodTypeAny) => ({
  required: true,
  content: { "application/json": { schema } },
});

function dataEnvelopeFor(schema: z.ZodTypeAny, name: string) {
  return z.object({ data: schema }).openapi(name);
}

const publicLibraryListResponse = dataEnvelopeFor(
  z.array(libraryPublicSummarySchema),
  "PublicLibraryListResponse",
);
const publicLibraryDetailResponse = dataEnvelopeFor(
  libraryPublicDetailSchema,
  "PublicLibraryDetailResponse",
);
const publicSkillListResponse = dataEnvelopeFor(
  z.array(publicSkillSummarySchema),
  "PublicSkillListResponse",
);
const publicSkillDetailResponse = dataEnvelopeFor(
  publicSkillDetailSchema,
  "PublicSkillDetailResponse",
);
const publicSkillReleaseDetailResponse = dataEnvelopeFor(
  publicSkillReleaseDetailSchema,
  "PublicSkillReleaseDetailResponse",
);
const userCourseListResponse = dataEnvelopeFor(
  z.array(userCourseSummarySchema),
  "UserCourseListResponse",
);
const userInformationFeedResponse = dataEnvelopeFor(
  userInformationFeedSchema,
  "UserInformationFeedResponse",
);
const userInformationDetailResponse = dataEnvelopeFor(
  userInformationDetailSchema,
  "UserInformationDetailResponse",
);
const userInformationAckResponse = dataEnvelopeFor(
  userInformationAckResponseSchema,
  "UserInformationAckResponseEnvelope",
);
const providerSyncPreviewEnvelope = dataEnvelopeFor(
  providerSyncPreviewResponseSchema.openapi("ProviderSyncPreview"),
  "ProviderSyncPreviewEnvelope",
);
const providerSyncJobEnvelope = dataEnvelopeFor(
  z.object({ job: providerSyncJobResponseSchema.openapi("ProviderSyncJob"), replayed: z.boolean().optional() }),
  "ProviderSyncJobEnvelope",
);
const providerSyncJobReadEnvelope = dataEnvelopeFor(
  z.object({ job: providerSyncJobResponseSchema.openapi("ProviderSyncJob") }),
  "ProviderSyncJobReadEnvelope",
);
const adminOperationsOverviewEnvelope = dataEnvelopeFor(
  adminOperationsOverviewResponseSchema.openapi("AdminOperationsOverview"),
  "AdminOperationsOverviewEnvelope",
);
const webhookRetryEnvelope = dataEnvelopeFor(
  webhookRetryResponseSchema.openapi("WebhookRetryResponse"),
  "WebhookRetryEnvelope",
);
const responses = (successStatus = 200, successSchema: z.ZodTypeAny = dataEnvelope) => ({
  [successStatus]: { description: "Successful response", content: { "application/json": { schema: successSchema } } },
  400: { description: "Invalid request", content: { "application/json": { schema: errorEnvelope } } },
  401: { description: "Invalid, revoked, or expired credential", content: { "application/json": { schema: errorEnvelope } } },
  403: { description: "Insufficient scope", content: { "application/json": { schema: errorEnvelope } } },
  404: { description: "Resource not found", content: { "application/json": { schema: errorEnvelope } } },
  409: { description: "Resource state conflict", content: { "application/json": { schema: errorEnvelope } } },
  422: { description: "Business rule rejected the operation", content: { "application/json": { schema: errorEnvelope } } },
  428: { description: "Destructive confirmation required", content: { "application/json": { schema: errorEnvelope } } },
  500: { description: "Internal server error", content: { "application/json": { schema: errorEnvelope } } },
  502: { description: "Upstream provider error", content: { "application/json": { schema: errorEnvelope } } },
  503: { description: "Required safety prerequisite failed", content: { "application/json": { schema: errorEnvelope } } },
});

const providerSyncExecuteResponses = {
  ...responses(202, providerSyncJobEnvelope),
  200: {
    description: "Idempotent replay of a completed provider sync job",
    content: { "application/json": { schema: providerSyncJobEnvelope } },
  },
};

type DestructiveConfirmation = false | "flag" | "entity";

const idempotencyKeyHeaderSchema = z.object({
  "Idempotency-Key": z.string().min(1).max(200).regex(/^[!-~]+$/),
});

function operationHeaders(
  destructive: DestructiveConfirmation,
  idempotencyKey: boolean,
): z.ZodObject<z.ZodRawShape> | undefined {
  const shape: z.ZodRawShape = {};
  if (idempotencyKey) shape["Idempotency-Key"] = idempotencyKeyHeaderSchema.shape["Idempotency-Key"];
  if (destructive) shape["x-confirm-destructive"] = z.literal("true");
  if (destructive === "entity") shape["x-confirm-entity-id"] = z.string().min(1);
  return Object.keys(shape).length > 0 ? z.object(shape) : undefined;
}

function idempotentCreateResponses() {
  return {
    ...responses(201),
    200: {
      description: "Idempotent replay of an existing resource",
      content: { "application/json": { schema: dataEnvelope } },
    },
  };
}

function route(
  config: RouteConfig,
  scope: string,
  destructive: DestructiveConfirmation = false,
  credential: "agentKey" | "userKey" = "agentKey",
  idempotencyKey = false,
): RouteConfig {
  const confirmationDescription = destructive === "entity"
    ? " Requires `x-confirm-destructive: true` and matching `x-confirm-entity-id`."
    : destructive === "flag"
      ? " Requires `x-confirm-destructive: true`."
      : "";
  const idempotencyDescription = idempotencyKey
    ? " Requires `Idempotency-Key` with 1–200 visible ASCII characters."
    : "";
  return {
    ...config,
    security: [{ [credential]: [] }],
    description: `${config.description ?? ""}\n\nRequired scope: \`${scope}\`.${idempotencyDescription}${confirmationDescription}`.trim(),
    ...((destructive || idempotencyKey) ? {
      request: {
        ...config.request,
        headers: operationHeaders(destructive, idempotencyKey),
      },
    } : {}),
    "x-required-scope": scope,
    ...(idempotencyKey ? { "x-idempotency-key-required": true } : {}),
    ...(destructive ? {
      "x-destructive-confirmation": destructive,
    } : {}),
  } as RouteConfig;
}

function publicRoute(config: RouteConfig): RouteConfig {
  return {
    ...config,
    description: `${config.description ?? ""}\n\nNo credential is required. If an Authorization header is supplied, an invalid, revoked, or expired user credential returns 401 and never downgrades to anonymous.`.trim(),
  };
}

export function buildAgentOpenApi() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "agentKey", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "cab_agent_*",
  });
  registry.registerComponent("securitySchemes", "userKey", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "cab_user_*",
  });

  const resources = [
    {
      name: "Course",
      path: "/api/agent/courses",
      query: z.object({ id: z.string().optional() }),
      create: courseCreateSchema,
      update: courseUpdateSchema,
    },
    {
      name: "Chapter",
      path: "/api/agent/chapters",
      query: courseIdSchema,
      create: chapterCreateSchema,
      update: chapterUpdateSchema,
    },
    {
      name: "Lesson",
      path: "/api/agent/lessons",
      query: courseIdSchema,
      create: lessonCreateSchema,
      update: lessonUpdateSchema,
    },
  ];

  for (const resource of resources) {
    const tag = `${resource.name}s`;
    registry.registerPath(route({
      method: "get",
      path: resource.path,
      operationId: `list${tag}`,
      tags: [tag],
      request: { query: resource.query },
      responses: responses(),
    }, "content:read"));
    registry.registerPath(route({
      method: "post",
      path: resource.path,
      operationId: `create${resource.name}`,
      tags: [tag],
      request: { body: jsonBody(resource.create) },
      responses: responses(201),
    }, "content:write"));
    registry.registerPath(route({
      method: "patch",
      path: resource.path,
      operationId: `update${resource.name}`,
      tags: [tag],
      request: { body: jsonBody(resource.update) },
      responses: responses(200, successEnvelope),
    }, "content:write"));
    registry.registerPath(route({
      method: "delete",
      path: resource.path,
      operationId: `delete${resource.name}`,
      tags: [tag],
      request: { body: jsonBody(entityDeleteSchema) },
      responses: responses(200, successEnvelope),
    }, "content:delete", "entity"));
  }

  registry.registerPath(route({
    method: "post",
    path: "/api/agent/readiness",
    operationId: "validateCourseReadiness",
    tags: ["Publishing"],
    request: { body: jsonBody(courseIdSchema) },
    responses: responses(),
  }, "content:publish"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/publish",
    operationId: "publishCourse",
    tags: ["Publishing"],
    request: { body: jsonBody(courseInformationPublishSchema) },
    responses: responses(),
  }, "content:publish", "flag"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/plans",
    operationId: "listPlans",
    tags: ["Plans"],
    responses: responses(),
  }, "content:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/plans",
    operationId: "createPlan",
    tags: ["Plans"],
    request: { body: jsonBody(planCreateSchema) },
    responses: responses(201),
  }, "plan:write"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/plans/{id}",
    operationId: "updatePlan",
    tags: ["Plans"],
    request: { params: planIdPathSchema, body: jsonBody(planUpdateSchema) },
    responses: responses(),
  }, "plan:write"));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/plans/{id}",
    operationId: "deletePlan",
    tags: ["Plans"],
    request: { params: planIdPathSchema },
    responses: responses(),
  }, "plan:delete", "entity"));

  registry.registerPath(route({
    method: "post",
    path: "/api/agent/plans/{id}/courses",
    operationId: "bindCourseToPlan",
    tags: ["Plan delivery"],
    request: { params: planIdPathSchema, body: jsonBody(planCourseBindSchema) },
    responses: responses(201),
  }, "delivery:write"));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/plans/{id}/courses/{courseId}",
    operationId: "unbindCourseFromPlan",
    tags: ["Plan delivery"],
    request: { params: planCoursePathSchema },
    responses: responses(),
  }, "delivery:write", "entity"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/plans/{id}/contents",
    operationId: "listPlanContents",
    tags: ["Plan delivery"],
    request: { params: planIdPathSchema, query: includeDeletedQuerySchema },
    responses: responses(),
  }, "content:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/plans/{id}/contents",
    operationId: "createPlanContent",
    tags: ["Plan delivery"],
    request: { params: planIdPathSchema, body: jsonBody(planContentCreateSchema) },
    responses: responses(201),
  }, "delivery:write"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/plans/{id}/contents/{contentId}",
    operationId: "updatePlanContent",
    tags: ["Plan delivery"],
    request: { params: planContentPathSchema, body: jsonBody(planContentUpdateSchema) },
    responses: responses(),
  }, "delivery:write"));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/plans/{id}/contents/{contentId}",
    operationId: "deletePlanContent",
    tags: ["Plan delivery"],
    request: { params: planContentPathSchema },
    responses: responses(),
  }, "delivery:write", "entity"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/plans/{id}/services",
    operationId: "listPlanServices",
    tags: ["Plan services"],
    request: { params: planIdPathSchema },
    responses: responses(),
  }, "content:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/plans/{id}/services",
    operationId: "createPlanService",
    tags: ["Plan services"],
    request: { params: planIdPathSchema, body: jsonBody(planServiceCreateSchema) },
    responses: responses(201),
  }, "service:write"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/plans/{id}/services/{serviceId}",
    operationId: "updatePlanService",
    tags: ["Plan services"],
    request: { params: planServicePathSchema, body: jsonBody(planServiceUpdateSchema) },
    responses: responses(),
  }, "service:write"));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/plans/{id}/services/{serviceId}",
    operationId: "deletePlanService",
    tags: ["Plan services"],
    request: { params: planServicePathSchema },
    responses: responses(),
  }, "service:write", "entity"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/plans/{id}/services/{serviceId}/restore",
    operationId: "restorePlanService",
    tags: ["Plan services"],
    request: { params: planServicePathSchema },
    responses: responses(),
  }, "service:write"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/plans/{id}/presentation",
    operationId: "getPlanPresentation",
    tags: ["Plan presentation"],
    request: { params: planIdPathSchema },
    responses: responses(),
  }, "content:read"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/plans/{id}/presentation",
    operationId: "updatePlanPresentation",
    tags: ["Plan presentation"],
    request: { params: planIdPathSchema, body: jsonBody(planPresentationUpdateSchema) },
    responses: responses(),
  }, "plan:write"));
  for (const action of ["publish", "unpublish"] as const) {
    registry.registerPath(route({
      method: "post",
      path: `/api/agent/plans/{id}/presentation/${action}`,
      operationId: `${action}PlanPresentation`,
      tags: ["Plan presentation"],
      request: { params: planIdPathSchema },
      responses: responses(),
    }, "content:publish", "flag"));
  }

  for (const [path, operationId] of [
    ["/api/agent/courses/{id}/archive", "archiveCourse"],
    ["/api/agent/courses/{id}/unarchive", "unarchiveCourse"],
    ["/api/agent/courses/{id}/restore", "restoreCourse"],
    ["/api/agent/chapters/{id}/restore", "restoreChapter"],
    ["/api/agent/lessons/{id}/restore", "restoreLesson"],
  ] as const) {
    registry.registerPath(route({
      method: "post",
      path,
      operationId,
      tags: ["Content lifecycle"],
      request: { params: planIdPathSchema },
      responses: responses(),
    }, "content:write"));
  }
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/courses/{id}/content",
    operationId: "getUserCourseContent",
    tags: ["User content"],
    request: { params: planIdPathSchema, query: userCourseContentQuerySchema },
    responses: responses(200, userCourseContentSchema),
  }, "course:read", false, "userKey"));

  const publicLibraryPathSchema = z.object({ idOrSlug: z.string().min(1) });
  const publicSkillPathSchema = z.object({ idOrSlug: z.string().min(1) });
  const publicSkillReleasePathSchema = z.object({
    idOrSlug: z.string().min(1),
    version: z.string().min(1),
  });
  const userSkillReleasePathSchema = z.object({
    id: z.string().min(1),
    version: z.string().min(1),
  });

  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/library",
    operationId: "listPublicLibraryEntries",
    tags: ["Public Library"],
    description: "List published Library summaries. Full bodyMarkdown is available only from the detail operation.",
    responses: responses(200, publicLibraryListResponse),
  }));
  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/library/{idOrSlug}",
    operationId: "getPublicLibraryEntry",
    tags: ["Public Library"],
    request: { params: publicLibraryPathSchema },
    responses: responses(200, publicLibraryDetailResponse),
  }));
  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/skills",
    operationId: "listPublicSkills",
    tags: ["Public Skills"],
    description: "List published Skill catalog metadata. GitHub-backed Skills expose a structured, pinned distribution source; hosted Skills retain CabAI artifact access rules.",
    responses: responses(200, publicSkillListResponse),
  }));
  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/skills/{idOrSlug}",
    operationId: "getPublicSkill",
    tags: ["Public Skills"],
    description: "Get the CabAI catalog description and canonical distribution metadata. GitHub-backed Skills do not expose a CabAI version; follow distribution repository and installation URLs. Hosted Skills retain versioned release metadata.",
    request: { params: publicSkillPathSchema },
    responses: responses(200, publicSkillDetailResponse),
  }));
  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/skills/{idOrSlug}/releases/{version}",
    operationId: "getPublicSkillRelease",
    tags: ["Public Skills"],
    description: "Get a version-addressed hosted release projection. For GitHub-backed Skills, use the stable Skill detail endpoint and its distribution URLs instead of a CabAI release version.",
    request: { params: publicSkillReleasePathSchema },
    responses: responses(200, publicSkillReleaseDetailResponse),
  }));
  registry.registerPath(publicRoute({
    method: "get",
    path: "/api/agent/public/v1/skills/{idOrSlug}/releases/{version}/download",
    operationId: "downloadPublicSkillRelease",
    tags: ["Public Skills"],
    description: "Resolve a version-addressed Skill source. GitHub-backed clients should normally use the stable Skill detail distribution URLs; hosted public Skills receive a short-lived verified CabAI artifact target.",
    request: { params: publicSkillReleasePathSchema },
    responses: responses(),
  }));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/user/v1/skills/{id}/releases/{version}",
    operationId: "getUserSkillRelease",
    tags: ["User Skills"],
    request: { params: userSkillReleasePathSchema },
    responses: responses(200, publicSkillReleaseDetailResponse),
  }, "skill:read", false, "userKey"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/user/v1/skills/{id}/releases/{version}/download",
    operationId: "downloadUserSkillRelease",
    tags: ["User Skills"],
    description: "Resolve a version-addressed Skill source. GitHub-backed clients should normally use the stable public Skill detail distribution URLs; hosted releases receive a short-lived verified CabAI artifact target after user scope and access checks.",
    request: { params: userSkillReleasePathSchema },
    responses: responses(),
  }, "skill:read", false, "userKey"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/user/v1/courses",
    operationId: "listUserCourses",
    tags: ["User courses"],
    description: "List course summaries the authenticated user is entitled to read. Lesson content is retrieved separately and remains permission-checked.",
    responses: responses(200, userCourseListResponse),
  }, "course:read", false, "userKey"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/user/v1/information",
    operationId: "listUnreadInformation",
    tags: ["User Information"],
    description: "List visible unread Information with an opaque keyset cursor. This operation does not mark items read.",
    request: { query: userInformationListQuerySchema },
    responses: responses(200, userInformationFeedResponse),
  }, "information:read", false, "userKey"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/user/v1/information/{id}",
    operationId: "getUserInformation",
    tags: ["User Information"],
    description: "Get one visible Information item by id without changing its read state.",
    request: { params: z.object({ id: z.string().min(1).max(200) }).strict() },
    responses: responses(200, userInformationDetailResponse),
  }, "information:read", false, "userKey"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/user/v1/information/ack",
    operationId: "acknowledgeInformation",
    tags: ["User Information"],
    description: "Idempotently acknowledge a bounded batch for the authenticated stable user identity.",
    request: { body: jsonBody(userInformationAckSchema) },
    responses: responses(200, userInformationAckResponse),
  }, "information:ack", false, "userKey"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/grants",
    operationId: "listGrants",
    tags: ["Grants"],
    request: { query: grantListQuerySchema },
    responses: responses(),
  }, "members:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/grants",
    operationId: "createGrant",
    tags: ["Grants"],
    description: "Create a manual entitlement grant. The `x-confirm-entity-id` must equal `${userId}:${planId}` from the request body; replaying the same idempotency key and payload returns the original result.",
    request: { body: jsonBody(grantCreateSchema) },
    responses: idempotentCreateResponses(),
  }, "entitlements:write", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/grants",
    operationId: "revokeGrant",
    tags: ["Grants"],
    request: { body: jsonBody(grantRevokeSchema) },
    responses: responses(),
  }, "entitlements:write", "entity"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/members",
    operationId: "listMembers",
    tags: ["Operations"],
    request: { query: memberListQuerySchema },
    responses: responses(),
  }, "members:read"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/operations/overview",
    operationId: "getAdminOperationsOverview",
    tags: ["Operations"],
    description: "Return a bounded, prioritized administration overview with freshness and per-signal completeness. Failed sources are marked unavailable and are never represented as zero.",
    responses: responses(200, adminOperationsOverviewEnvelope),
  }, "system:read"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/orders",
    operationId: "listOrders",
    tags: ["Operations"],
    request: { query: orderListQuerySchema },
    responses: responses(),
  }, "orders:read"));

  registry.registerPath(route({
    method: "post",
    path: "/api/upload",
    operationId: "createMediaUploadTarget",
    tags: ["Media"],
    description: "Create a pending media record and a short-lived signed HTTP PUT target. The signed target expires after 900 seconds; upload the exact bytes using the requested Content-Type before calling confirmMediaUpload. The route enforces a per-minute limit of 120 Agent uploads per uploader and 10 interactive admin-session uploads. Allowed MIME types and maximum sizes by context: plan-cover, plan-banner, course-image, and lesson-thumbnail accept JPEG/PNG/WebP up to 10 MiB; lesson-content accepts PDF, JPEG/PNG/WebP, MP4/WebM, supported audio, Office document, and archive types up to 50 MiB, except MP4/WebM up to 500 MiB; service-guide accepts PDF/JPEG/PNG/WebP up to 50 MiB; skill-artifact accepts ZIP (`application/zip` or `application/x-zip-compressed`) up to 20 MiB. SVG is rejected.",
    request: { body: jsonBody(uploadSignedUrlRequestSchema) },
    responses: {
      200: { description: "Pending media row and a signed PUT target; `expiresIn` is 900 seconds.", content: { "application/json": { schema: uploadSignedUrlResponseSchema } } },
      400: { description: "Malformed JSON, invalid fields, disallowed MIME type, or context-specific size limit exceeded.", content: { "application/json": { schema: uploadApiError } } },
      401: { description: "Missing, invalid, expired, or revoked Agent credential.", content: { "application/json": { schema: basicApiError } } },
      403: { description: "Agent key lacks `media:write`, or an interactive session is not an administrator.", content: { "application/json": { schema: z.union([basicApiError, uploadApiError]) } } },
      429: { description: "Agent-key or upload endpoint rate limit exceeded. Agent-key throttling includes a `Retry-After` header.", content: { "application/json": { schema: z.union([basicApiError, uploadApiError]) } } },
      500: { description: "Storage target or media-row creation failed.", content: { "application/json": { schema: z.union([basicApiError, uploadApiError]) } } },
    },
  }, "media:write"));

  registry.registerPath(route({
    method: "post",
    path: "/api/upload/confirm",
    operationId: "confirmMediaUpload",
    tags: ["Media"],
    description: "Confirm an uploaded object after storage metadata verification. Provide `entityType` and `entityId` together to bind it; omit both to confirm it unbound. For `entityType: skillRelease`, also provide the current `expectedEntityRevision`; the server binds and validates the Skill ZIP artifact. Use listMedia with entity filters to read back status, context, and binding. Agent calls require `media:write`; binding a `skillRelease` additionally requires `skill:write`, including confirmation retries.",
    request: { body: jsonBody(uploadConfirmRequestSchema) },
    responses: {
      200: { description: "Media confirmed and optionally bound.", content: { "application/json": { schema: z.object({ success: z.literal(true), mediaId: z.string(), assetUrl: z.string() }) } } },
      400: { description: "Malformed JSON, invalid binding pair, context/entity mismatch, or uploaded object metadata mismatch.", content: { "application/json": { schema: uploadConfirmError } } },
      401: { description: "Missing, invalid, expired, or revoked Agent credential.", content: { "application/json": { schema: basicApiError } } },
      403: { description: "Agent key lacks `media:write` or the additional `skill:write` required for Skill release binding, or an interactive session is not an administrator.", content: { "application/json": { schema: basicApiError } } },
      404: { description: "Pending media row, uploaded object, or target entity was not found.", content: { "application/json": { schema: uploadConfirmError } } },
      409: { description: "Media is already bound to a different entity, or a concurrent confirmation changed the row.", content: { "application/json": { schema: uploadConfirmError } } },
      422: { description: "Skill artifact validation rejected the uploaded ZIP.", content: { "application/json": { schema: uploadConfirmError } } },
      429: { description: "Agent-key rate limit exceeded; response includes a `Retry-After` header.", content: { "application/json": { schema: basicApiError } } },
      500: { description: "Storage, database, or confirmation service error.", content: { "application/json": { schema: basicApiError } } },
      503: { description: "Skill artifact validation prerequisite was unavailable.", content: { "application/json": { schema: uploadConfirmError } } },
    },
  }, "media:write"));

  registry.registerPath({
    method: "get",
    path: "/api/agent/openapi.yaml",
    operationId: "getAdminOpenApi",
    tags: ["Agent contract"],
    description: "Return this Admin and User Agent API contract as YAML. Any valid Admin Agent key is accepted; this discovery operation does not require an additional permission scope.",
    security: [{ agentKey: [] }],
    responses: {
      200: { description: "The live OpenAPI document.", content: { "application/yaml": { schema: z.string() } } },
      401: { description: "Missing, invalid, expired, or revoked Agent credential.", content: { "application/json": { schema: basicApiError } } },
      429: { description: "Agent-key rate limit exceeded; response includes a `Retry-After` header.", content: { "application/json": { schema: basicApiError } } },
      500: { description: "OpenAPI document could not be loaded.", content: { "application/json": { schema: basicApiError } } },
    },
  });

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/media",
    operationId: "listMedia",
    tags: ["Media"],
    request: { query: mediaListQuerySchema },
    responses: responses(200, agentMediaListResponse),
  }, "content:read"));
  registry.registerPath(route({
    method: "delete",
    path: "/api/agent/media/{id}",
    operationId: "deleteMedia",
    tags: ["Media"],
    request: { params: planIdPathSchema },
    responses: responses(),
  }, "media:delete", "entity"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/media/cleanup-orphans",
    operationId: "cleanupOrphanMedia",
    tags: ["Media"],
    request: { body: jsonBody(mediaCleanupSchema) },
    responses: responses(),
  }, "media:delete", "flag"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/webhooks",
    operationId: "listWebhooks",
    tags: ["Webhooks"],
    request: { query: webhookListQuerySchema },
    responses: responses(),
  }, "webhooks:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/webhooks/retry",
    operationId: "retryWebhook",
    tags: ["Webhooks"],
    description: "Retry a dead-letter or failed webhook. Reusing the same Idempotency-Key and request body replays the original result; reusing the key with a different body returns 409.",
    request: { body: jsonBody(webhookRetrySchema) },
    responses: responses(200, webhookRetryEnvelope),
  }, "webhooks:retry", "entity", "agentKey", true));

  for (const [resource, operationId, description] of [
    ["orders", "syncOrders", "Queue a fresh order rebuild change set from preview. Returns a durable, idempotent job immediately; a background worker takes the recovery snapshot and applies the sync."],
    ["subscriptions", "syncSubscriptions", "Queue a fresh subscription reconcile change set from preview. Returns a durable, idempotent job immediately; a background worker takes the recovery snapshot and applies the sync."],
  ] as const) {
    registry.registerPath(route({
      method: "post",
      path: `/api/agent/sync/${resource}`,
      operationId,
      tags: ["System sync"],
      description,
      request: { body: jsonBody(providerSyncExecuteSchema) },
      responses: providerSyncExecuteResponses,
    }, "system:sync", "flag", "agentKey", true));
    registry.registerPath(route({
      method: "post",
      path: `/api/agent/sync/${resource}/preview`,
      operationId: `preview${resource[0]!.toUpperCase()}${resource.slice(1)}Sync`,
      tags: ["System sync"],
      description: `Read Portaly ${resource} state and return a 15-minute, actor-bound change set. Does not mutate local data.`,
      responses: responses(200, providerSyncPreviewEnvelope),
    }, "system:sync"));
  }

  registry.registerPath(route({
    method: "post",
    path: "/api/agent/sync/plans/preview",
    operationId: "previewPlanSync",
    tags: ["System sync"],
    description: "Read Portaly plans and return a 15-minute, actor-bound change set. Does not modify local plans.",
    responses: responses(200, providerSyncPreviewEnvelope),
  }, "system:sync"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/sync/plans",
    operationId: "syncPlans",
    tags: ["System sync"],
    description: "Queue only a fresh plan change set returned by preview. Returns a durable, idempotent job immediately; a background worker takes the plans snapshot and applies the sync. Read status through the sync job endpoint.",
    request: { body: jsonBody(providerSyncExecuteSchema) },
    responses: providerSyncExecuteResponses,
  }, "system:sync", "flag", "agentKey", true));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/sync/operations/{id}",
    operationId: "getProviderSyncJob",
    tags: ["System sync"],
    description: "Read back the status and safe result of an actor-owned provider sync execution.",
    request: { params: providerSyncJobPathSchema },
    responses: responses(200, providerSyncJobReadEnvelope),
  }, "system:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/sync/operations/{id}/recover",
    operationId: "recoverProviderSyncJob",
    tags: ["System sync"],
    description: "Restore the local pre-sync snapshot only if the affected tables are unchanged since the job and no generated entitlement event has begun external delivery. The x-confirm-entity-id must equal the provider sync job ID in the path. Referenced new plans/orders are refused for manual recovery.",
    request: { params: providerSyncJobPathSchema },
    responses: responses(200, providerSyncJobEnvelope),
  }, "system:sync", "entity", "agentKey", true));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/library-entries",
    operationId: "listLibraryEntries",
    tags: ["Library administration"],
    description: "List every Library entry visible to an administrator.",
    responses: responses(),
  }, "library:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/library-entries",
    operationId: "createLibraryEntry",
    tags: ["Library administration"],
    description: "Create a Library draft. Reusing the same idempotency key and payload replays the original resource; a different payload conflicts.",
    request: { body: jsonBody(createLibraryEntrySchema) },
    responses: idempotentCreateResponses(),
  }, "library:write", false, "agentKey", true));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/library-entries/{id}",
    operationId: "getLibraryEntry",
    tags: ["Library administration"],
    request: { params: libraryEntryPathSchema },
    responses: responses(),
  }, "library:read"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/library-entries/{id}",
    operationId: "updateLibraryEntry",
    tags: ["Library administration"],
    description: "Update an authorable draft or published Library entry using optimistic revision control. Published slugs remain immutable.",
    request: { params: libraryEntryPathSchema, body: jsonBody(updateLibraryEntrySchema) },
    responses: responses(),
  }, "library:write"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/library-entries/{id}/readiness",
    operationId: "checkLibraryEntryReadiness",
    tags: ["Library administration"],
    request: { params: libraryEntryPathSchema },
    responses: responses(),
  }, "library:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/library-entries/{id}/publish",
    operationId: "publishLibraryEntryBundle",
    tags: ["Library administration"],
    description: "Atomically publish a ready Library entry and its ready Information record. Body libraryId and confirmation entity ID must equal the path id.",
    request: { params: libraryEntryPathSchema, body: jsonBody(libraryBundlePublishSchema) },
    responses: responses(),
  }, "library:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/library-entries/{id}/withdraw",
    operationId: "withdrawLibraryEntry",
    tags: ["Library administration"],
    description: "Withdraw a Library entry using optimistic revision control.",
    request: { params: libraryEntryPathSchema, body: jsonBody(expectedRevisionSchema) },
    responses: responses(),
  }, "library:publish", "entity"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/skills",
    operationId: "listSkills",
    tags: ["Skill administration"],
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skills",
    operationId: "createSkill",
    tags: ["Skill administration"],
    description: "Create a Skill draft with replay-safe idempotency.",
    request: { body: jsonBody(createSkillInputSchema) },
    responses: idempotentCreateResponses(),
  }, "skill:write", false, "agentKey", true));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/skills/{id}",
    operationId: "getSkill",
    tags: ["Skill administration"],
    request: { params: skillPathSchema },
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/skills/{id}",
    operationId: "updateSkill",
    tags: ["Skill administration"],
    request: { params: skillPathSchema, body: jsonBody(updateSkillInputSchema) },
    responses: responses(),
  }, "skill:write"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skills/{id}/readiness",
    operationId: "checkSkillReadiness",
    tags: ["Skill administration"],
    request: { params: skillPathSchema },
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skills/{id}/publish",
    operationId: "publishSkillBundle",
    tags: ["Skill administration"],
    description: "Atomically publish a ready Skill, release, and Information record. Body skillId and confirmation entity ID must equal the path id.",
    request: { params: skillPathSchema, body: jsonBody(skillBundlePublishSchema) },
    responses: responses(),
  }, "skill:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skills/{id}/withdraw",
    operationId: "withdrawSkill",
    tags: ["Skill administration"],
    request: { params: skillPathSchema, body: jsonBody(expectedRevisionSchema) },
    responses: responses(),
  }, "skill:publish", "entity"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/skills/{id}/releases",
    operationId: "listSkillReleases",
    tags: ["Skill release administration"],
    request: { params: skillPathSchema },
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skills/{id}/releases",
    operationId: "createSkillRelease",
    tags: ["Skill release administration"],
    description: "Create a release draft. Body skillId must equal the path id.",
    request: { params: skillPathSchema, body: jsonBody(createSkillReleaseInputSchema) },
    responses: idempotentCreateResponses(),
  }, "skill:write", false, "agentKey", true));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/skill-releases/{releaseId}",
    operationId: "getSkillRelease",
    tags: ["Skill release administration"],
    request: { params: skillReleasePathSchema },
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/skill-releases/{releaseId}",
    operationId: "updateSkillRelease",
    tags: ["Skill release administration"],
    request: { params: skillReleasePathSchema, body: jsonBody(updateSkillReleaseInputSchema) },
    responses: responses(),
  }, "skill:write"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skill-releases/{releaseId}/readiness",
    operationId: "checkSkillReleaseReadiness",
    tags: ["Skill release administration"],
    request: { params: skillReleasePathSchema },
    responses: responses(),
  }, "skill:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skill-releases/{releaseId}/publish",
    operationId: "publishSkillReleaseBundle",
    tags: ["Skill release administration"],
    description: "Alias for publishing the same Skill, release, and Information bundle. Body releaseId and confirmation entity ID must equal the path releaseId.",
    request: { params: skillReleasePathSchema, body: jsonBody(skillBundlePublishSchema) },
    responses: responses(),
  }, "skill:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skill-releases/{releaseId}/publish-skill-only",
    operationId: "publishSkillReleaseOnly",
    tags: ["Skill release administration"],
    description: "Publishes a ready Skill release and makes it current without creating or publishing an Information announcement. Body releaseId and confirmation entity ID must equal the path releaseId.",
    request: { params: skillReleasePathSchema, body: jsonBody(publishSkillReleaseInputSchema) },
    responses: responses(),
  }, "skill:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skill-releases/{releaseId}/deprecate",
    operationId: "deprecateSkillRelease",
    tags: ["Skill release administration"],
    request: { params: skillReleasePathSchema, body: jsonBody(expectedRevisionSchema) },
    responses: responses(),
  }, "skill:publish", "entity"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/skill-releases/{releaseId}/withdraw",
    operationId: "withdrawSkillRelease",
    tags: ["Skill release administration"],
    request: { params: skillReleasePathSchema, body: jsonBody(expectedRevisionSchema) },
    responses: responses(),
  }, "skill:publish", "entity"));

  registry.registerPath(route({
    method: "get",
    path: "/api/agent/information",
    operationId: "listInformation",
    tags: ["Information administration"],
    request: { query: informationListQuerySchema },
    responses: responses(),
  }, "information:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/information",
    operationId: "createInformationDraft",
    tags: ["Information administration"],
    description: "Create a source-backed Information draft with replay-safe idempotency.",
    request: { body: jsonBody(informationCreateSchema) },
    responses: idempotentCreateResponses(),
  }, "information:write", false, "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/information/drafts/from-source",
    operationId: "prepareInformationDraftFromSource",
    tags: ["Information administration"],
    description: "Build and return the canonical source bundle without persisting an Information row.",
    request: { body: jsonBody(informationSourceDraftSchema) },
    responses: responses(),
  }, "information:write"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/information/coverage",
    operationId: "getInformationCoverage",
    tags: ["Information administration"],
    description: "Report source coverage and actionable readiness issue codes.",
    responses: responses(),
  }, "information:read"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/information/{id}",
    operationId: "getInformation",
    tags: ["Information administration"],
    request: { params: informationPathSchema },
    responses: responses(),
  }, "information:read"));
  registry.registerPath(route({
    method: "patch",
    path: "/api/agent/information/{id}",
    operationId: "updateInformationDraft",
    tags: ["Information administration"],
    request: { params: informationPathSchema, body: jsonBody(informationUpdateSchema) },
    responses: responses(),
  }, "information:write"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/information/{id}/readiness",
    operationId: "checkInformationReadiness",
    tags: ["Information administration"],
    request: { params: informationPathSchema },
    responses: responses(),
  }, "information:read"));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/information/{id}/publish",
    operationId: "publishInformation",
    tags: ["Information administration"],
    description: "Publish a ready Information record. Confirmation entity ID must equal the path id.",
    request: { params: informationPathSchema, body: jsonBody(informationTransitionSchema) },
    responses: responses(),
  }, "information:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "post",
    path: "/api/agent/information/{id}/withdraw",
    operationId: "withdrawInformation",
    tags: ["Information administration"],
    request: { params: informationPathSchema, body: jsonBody(informationTransitionSchema) },
    responses: responses(),
  }, "information:publish", "entity", "agentKey", true));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/information/{id}/history",
    operationId: "getInformationHistory",
    tags: ["Information administration"],
    request: { params: informationPathSchema },
    responses: responses(),
  }, "information:read"));
  registry.registerPath(route({
    method: "get",
    path: "/api/agent/information/{id}/stats",
    operationId: "getInformationStats",
    tags: ["Information administration"],
    description: "Return aggregate eligible, read, and unread counts without exposing user identities.",
    request: { params: informationPathSchema },
    responses: responses(),
  }, "information:read"));

  const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "CabAI Agent API",
      version: "1.0.0",
      description: "Versioned contract for migrated Agent endpoints. Internal DB shapes and secrets are excluded.",
    },
    servers: [{ url: "/", description: "Current CabAI deployment" }],
  });
  return {
    ...document,
    "x-error-codes": {
      EMPTY_JSON_BODY: { retryable: false },
      MALFORMED_JSON: { retryable: false },
      VALIDATION_ERROR: { retryable: false },
      INVALID_QUERY: { retryable: false },
      INVALID_PATH: { retryable: false },
      INVALID_IDEMPOTENCY_KEY: { retryable: false },
      PATH_BODY_MISMATCH: { retryable: false },
      INTERNAL_ERROR: { retryable: true },
    },
  };
}

const OPENAPI_HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

function collectSchemaRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectSchemaRefs(entry, refs);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string") {
      const match = entry.match(/^#\/components\/schemas\/(.+)$/);
      if (match?.[1]) refs.add(match[1]);
    } else {
      collectSchemaRefs(entry, refs);
    }
  }
}

function projectUserComponents(
  fullDocument: ReturnType<typeof buildAgentOpenApi>,
  paths: Record<string, Record<string, unknown>>,
) {
  const allSchemas = (fullDocument.components?.schemas ?? {}) as Record<string, unknown>;
  const requiredSchemas = new Set<string>();
  collectSchemaRefs(paths, requiredSchemas);

  const pending = [...requiredSchemas];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || !(name in allSchemas)) continue;
    const nestedRefs = new Set<string>();
    collectSchemaRefs(allSchemas[name], nestedRefs);
    for (const nested of nestedRefs) {
      if (!requiredSchemas.has(nested)) {
        requiredSchemas.add(nested);
        pending.push(nested);
      }
    }
  }

  return {
    schemas: Object.fromEntries(
      [...requiredSchemas]
        .filter((name) => name in allSchemas)
        .map((name) => [name, allSchemas[name]]),
    ),
    securitySchemes: {
      userKey: fullDocument.components?.securitySchemes?.userKey,
    },
  };
}

/**
 * Build the contract that may be shown to a User Agent.
 *
 * Keep this as a projection of the full registry instead of maintaining a
 * second hand-written route list. That makes newly registered Admin routes
 * fail closed: an operation is included only when it is public or explicitly
 * secured by userKey, never merely because it looks read-only.
 */
export function buildUserAgentOpenApi() {
  const fullDocument = buildAgentOpenApi();
  const paths: Record<string, Record<string, unknown>> = {};

  for (const [path, pathItem] of Object.entries(fullDocument.paths)) {
    const source = pathItem as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};

    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = source[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      const security = operation.security as Array<Record<string, unknown>> | undefined;
      const isPublic = security === undefined;
      const isUserOperation = security?.some((requirement) => (
        Object.prototype.hasOwnProperty.call(requirement, "userKey")
        && !Object.prototype.hasOwnProperty.call(requirement, "agentKey")
      )) ?? false;

      if (isPublic || isUserOperation) filtered[method] = operation;
    }

    if (Object.keys(filtered).length > 0) paths[path] = filtered;
  }

  return {
    ...fullDocument,
    info: {
      ...fullDocument.info,
      title: "CabAI User Agent API",
      description: "Public discovery and authenticated User Agent contract. User credentials still control access to entitled content.",
    },
    paths,
    components: projectUserComponents(fullDocument, paths),
    "x-agent-plane": "user",
  };
}

export function serializeAgentOpenApi(): string {
  return `${JSON.stringify(buildAgentOpenApi(), null, 2)}\n`;
}

export function serializeAgentOpenApiYaml(): string {
  return stringifyYaml(buildAgentOpenApi(), {
    lineWidth: 0,
    sortMapEntries: false,
  });
}

export function serializeUserAgentOpenApiYaml(): string {
  return stringifyYaml(buildUserAgentOpenApi(), {
    lineWidth: 0,
    sortMapEntries: false,
  });
}
