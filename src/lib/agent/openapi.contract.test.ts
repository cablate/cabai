import { describe, expect, it } from "vitest";
import { buildAgentOpenApi, buildUserAgentOpenApi } from "./openapi";

describe("Agent OpenAPI contract", () => {
  it("documents content and plan operations with unique operation IDs and scopes", () => {
    const document = buildAgentOpenApi();
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods ?? {})
        .filter(([method]) => ["get", "post", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({ path, method, operation: operation as Record<string, unknown> })),
    );

    expect(operations).toHaveLength(107);
    expect(new Set(operations.map(({ operation }) => operation.operationId)).size).toBe(107);
    expect(operations.every(({ path, operation }) => (
      typeof operation["x-required-scope"] === "string"
      || path.startsWith("/api/agent/public/v1/")
      || path === "/api/agent/openapi.yaml"
    ))).toBe(true);

    const destructive = operations.filter(({ operation }) => operation["x-destructive-confirmation"]);
    expect(destructive.map(({ method, path, operation }) =>
      `${operation["x-destructive-confirmation"]} ${method} ${path}`,
    )).toEqual([
      "entity delete /api/agent/courses",
      "entity delete /api/agent/chapters",
      "entity delete /api/agent/lessons",
      "flag post /api/agent/publish",
      "entity delete /api/agent/plans/{id}",
      "entity delete /api/agent/plans/{id}/courses/{courseId}",
      "entity delete /api/agent/plans/{id}/contents/{contentId}",
      "entity delete /api/agent/plans/{id}/services/{serviceId}",
      "flag post /api/agent/plans/{id}/presentation/publish",
      "flag post /api/agent/plans/{id}/presentation/unpublish",
      "entity post /api/agent/grants",
      "entity delete /api/agent/grants",
      "entity delete /api/agent/media/{id}",
      "flag post /api/agent/media/cleanup-orphans",
      "entity post /api/agent/webhooks/retry",
      "flag post /api/agent/sync/orders",
      "flag post /api/agent/sync/subscriptions",
      "flag post /api/agent/sync/plans",
      "entity post /api/agent/sync/operations/{id}/recover",
      "entity post /api/agent/library-entries/{id}/publish",
      "entity post /api/agent/library-entries/{id}/withdraw",
      "entity post /api/agent/skills/{id}/publish",
      "entity post /api/agent/skills/{id}/withdraw",
      "entity post /api/agent/skill-releases/{releaseId}/publish",
      "entity post /api/agent/skill-releases/{releaseId}/publish-skill-only",
      "entity post /api/agent/skill-releases/{releaseId}/deprecate",
      "entity post /api/agent/skill-releases/{releaseId}/withdraw",
      "entity post /api/agent/information/{id}/publish",
      "entity post /api/agent/information/{id}/withdraw",
    ]);
  });

  it("documents every WP-04 create and publish operation as idempotent", () => {
    const document = buildAgentOpenApi();
    const idempotent = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods ?? {})
        .filter(([method]) => ["post", "patch"].includes(method))
        .map(([method, operation]) => ({ path, method, operation: operation as Record<string, unknown> }))
        .filter(({ operation }) => operation["x-idempotency-key-required"]),
    );

    expect(idempotent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "post /api/agent/grants",
      "post /api/agent/webhooks/retry",
      "post /api/agent/sync/orders",
      "post /api/agent/sync/subscriptions",
      "post /api/agent/sync/plans",
      "post /api/agent/sync/operations/{id}/recover",
      "post /api/agent/library-entries",
      "post /api/agent/library-entries/{id}/publish",
      "post /api/agent/skills",
      "post /api/agent/skills/{id}/publish",
      "post /api/agent/skills/{id}/releases",
      "post /api/agent/skill-releases/{releaseId}/publish",
      "post /api/agent/skill-releases/{releaseId}/publish-skill-only",
      "post /api/agent/information",
      "post /api/agent/information/{id}/publish",
      "post /api/agent/information/{id}/withdraw",
    ]);

    for (const { operation } of idempotent) {
      const parameters = operation.parameters as Array<Record<string, unknown>>;
      expect(parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true }),
      ]));
    }
  });

  it("documents preview, freshness, idempotency, and read-back for all provider syncs", () => {
    const document = buildAgentOpenApi();
    for (const operation of ["plans", "orders", "subscriptions"] as const) {
      const preview = document.paths[`/api/agent/sync/${operation}/preview`]?.post;
      const execute = document.paths[`/api/agent/sync/${operation}`]?.post;
      expect(preview?.["x-required-scope"]).toBe("system:sync");
      expect(preview?.description).toContain("15-minute");
      expect(execute?.["x-required-scope"]).toBe("system:sync");
      expect(execute?.["x-idempotency-key-required"]).toBe(true);
      expect(execute?.["x-destructive-confirmation"]).toBe("flag");
      expect(execute?.requestBody).toBeDefined();
      expect(execute?.responses["202"]).toBeDefined();
      expect(execute?.responses["200"]).toBeDefined();
    }
    expect(document.paths["/api/agent/sync/operations/{id}"]?.get?.["x-required-scope"]).toBe("system:read");
    const recovery = document.paths["/api/agent/sync/operations/{id}/recover"]?.post;
    expect(recovery?.["x-required-scope"]).toBe("system:sync");
    expect(recovery?.["x-idempotency-key-required"]).toBe(true);
    expect(recovery?.description).toContain("external delivery");
    expect(recovery?.["x-destructive-confirmation"]).toBe("entity");
    expect(recovery?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: "header", name: "x-confirm-entity-id", required: true }),
    ]));
    expect(recovery?.description).toContain("provider sync job ID in the path");
  });

  it("documents shared Agent-auth media upload, confirmation, limits, and read-back", () => {
    const document = buildAgentOpenApi();
    const createTarget = document.paths["/api/upload"]?.post;
    const confirmUpload = document.paths["/api/upload/confirm"]?.post;
    const listMedia = document.paths["/api/agent/media"]?.get;

    expect(createTarget?.operationId).toBe("createMediaUploadTarget");
    expect(createTarget?.security).toEqual([{ agentKey: [] }]);
    expect(createTarget?.["x-required-scope"]).toBe("media:write");
    expect(createTarget?.description).toContain("900 seconds");
    expect(createTarget?.description).toContain("20 MiB");
    expect(createTarget?.responses["200"]?.content?.["application/json"]?.schema).toMatchObject({
      properties: {
        signedUrl: { type: "string", format: "uri" },
        mediaId: { type: "string" },
        storageKey: { type: "string" },
        expiresIn: { type: "number" },
      },
    });

    expect(confirmUpload?.operationId).toBe("confirmMediaUpload");
    expect(confirmUpload?.security).toEqual([{ agentKey: [] }]);
    expect(confirmUpload?.["x-required-scope"]).toBe("media:write");
    expect(confirmUpload?.description).toContain("expectedEntityRevision");
    expect(confirmUpload?.description).toContain("read back");

    expect(listMedia?.responses["200"]?.content?.["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/AgentMediaListResponse",
    });
    expect(document.components?.schemas?.AgentMediaListResponse).toMatchObject({
      properties: {
        data: { type: "array", items: { $ref: "#/components/schemas/AgentMediaRecord" } },
        pagination: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" }, hasMore: { type: "boolean" } } },
      },
    });
    expect(document.components?.schemas).toMatchObject({
      AgentMediaRecord: expect.objectContaining({
        properties: expect.objectContaining({
          context: expect.objectContaining({ enum: expect.arrayContaining(["skill-artifact"]) }),
        }),
      }),
    });
  });

  it("documents createGrant's replay key and entity-bound confirmation", () => {
    const operation = buildAgentOpenApi().paths["/api/agent/grants"]?.post;
    const parameters = operation?.parameters as unknown as Array<Record<string, unknown>>;

    expect(operation?.["x-required-scope"]).toBe("entitlements:write");
    expect(operation?.["x-idempotency-key-required"]).toBe(true);
    expect(operation?.["x-destructive-confirmation"]).toBe("entity");
    expect(operation?.description).toContain("${userId}:${planId}");
    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true }),
      expect.objectContaining({ in: "header", name: "x-confirm-destructive", required: true }),
      expect.objectContaining({ in: "header", name: "x-confirm-entity-id", required: true }),
    ]));
    expect(operation?.responses["201"]).toBeDefined();
    expect(operation?.responses["200"]).toBeDefined();
  });

  it("documents partial Admin overview signals and webhook retry idempotency", () => {
    const document = buildAgentOpenApi();
    const overview = document.paths["/api/agent/operations/overview"]?.get;
    const retry = document.paths["/api/agent/webhooks/retry"]?.post;
    const retryParameters = retry?.parameters as unknown as Array<Record<string, unknown>>;

    expect(overview?.description).toContain("never represented as zero");
    expect(overview?.responses["200"]?.content?.["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/AdminOperationsOverviewEnvelope",
    });
    expect(document.components?.schemas?.AdminOperationsOverview).toMatchObject({
      properties: {
        status: expect.any(Object),
        completeness: expect.any(Object),
        unavailableSignals: expect.any(Object),
        total: expect.any(Object),
      },
    });

    expect(retry?.["x-idempotency-key-required"]).toBe(true);
    expect(retry?.description).toContain("replays the original result");
    expect(retry?.description).toContain("different body returns 409");
    expect(retryParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true }),
    ]));
    expect(retry?.responses["200"]?.content?.["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/WebhookRetryEnvelope",
    });
  });

  it("documents user-token course content with the user security scheme", () => {
    const document = buildAgentOpenApi();
    const operation = document.paths["/api/agent/courses/{id}/content"]?.get;

    expect(operation?.security).toEqual([{ userKey: [] }]);
    expect(operation?.["x-required-scope"]).toBe("course:read");
  });

  it("separates anonymous public discovery from the fixed User Agent profile", () => {
    const document = buildAgentOpenApi();
    const expected = [
      ["get", "/api/agent/public/v1/library", "listPublicLibraryEntries", null],
      ["get", "/api/agent/public/v1/library/{idOrSlug}", "getPublicLibraryEntry", null],
      ["get", "/api/agent/public/v1/skills", "listPublicSkills", null],
      ["get", "/api/agent/public/v1/skills/{idOrSlug}", "getPublicSkill", null],
      ["get", "/api/agent/public/v1/skills/{idOrSlug}/releases/{version}", "getPublicSkillRelease", null],
      ["get", "/api/agent/public/v1/skills/{idOrSlug}/releases/{version}/download", "downloadPublicSkillRelease", null],
      ["get", "/api/agent/user/v1/skills/{id}/releases/{version}", "getUserSkillRelease", "skill:read"],
      ["get", "/api/agent/user/v1/skills/{id}/releases/{version}/download", "downloadUserSkillRelease", "skill:read"],
      ["get", "/api/agent/user/v1/courses", "listUserCourses", "course:read"],
      ["get", "/api/agent/user/v1/information", "listUnreadInformation", "information:read"],
      ["get", "/api/agent/user/v1/information/{id}", "getUserInformation", "information:read"],
      ["post", "/api/agent/user/v1/information/ack", "acknowledgeInformation", "information:ack"],
    ] as const;

    for (const [method, path, operationId, scope] of expected) {
      const operation = document.paths[path]?.[method];
      expect(operation?.operationId).toBe(operationId);
      if (scope === null) {
        expect(operation?.security).toBeUndefined();
        expect(operation?.["x-required-scope"]).toBeUndefined();
        expect(operation?.description).toContain("never downgrades to anonymous");
      } else {
        expect(operation?.security).toEqual([{ userKey: [] }]);
        expect(operation?.["x-required-scope"]).toBe(scope);
      }
    }
  });

  it("projects only public and User Agent operations into the User contract", () => {
    const document = buildUserAgentOpenApi();
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods ?? {})
        .filter(([method]) => ["get", "post", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({ path, method, operation: operation as Record<string, unknown> })),
    );

    expect(operations.length).toBeGreaterThan(0);
    expect(operations.some(({ operation }) => operation.operationId === "listUnreadInformation")).toBe(true);
    expect(operations.some(({ operation }) => operation.operationId === "getUserCourseContent")).toBe(true);
    expect(operations.some(({ operation }) => operation.operationId === "listPublicLibraryEntries")).toBe(true);
    expect(operations.some(({ operation }) => operation.operationId === "createLibraryEntry")).toBe(false);
    expect(operations.some(({ operation }) => operation.operationId === "publishInformation")).toBe(false);
    expect(operations.every(({ operation }) => {
      const security = operation.security as Array<Record<string, unknown>> | undefined;
      return security === undefined || security.every((requirement) => !Object.hasOwn(requirement, "agentKey"));
    })).toBe(true);
    expect(document.components?.securitySchemes).toEqual({ userKey: expect.any(Object) });
    expect(document.components?.schemas).not.toHaveProperty("CourseCreateInput");
    expect(document.components?.schemas).not.toHaveProperty("InformationCreateInput");
    expect(document.components?.schemas).toHaveProperty("UserCourseSummary");
    expect(document.components?.schemas).toHaveProperty("UserInformationDetail");

    const refs = new Set<string>();
    const collectRefs = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectRefs);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "$ref" && typeof entry === "string") refs.add(entry);
        else collectRefs(entry);
      }
    };
    collectRefs(document.paths);
    for (const ref of refs) {
      const name = ref.replace("#/components/schemas/", "");
      if (name !== ref) expect(document.components?.schemas).toHaveProperty(name);
    }
  });
});
