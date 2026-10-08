import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SkillReleaseServiceModule from "@/lib/services/skill-release-service";

const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  requireDestructiveConfirmation: vi.fn(),
  createSkill: vi.fn(),
  createSkillRelease: vi.fn(),
  updateSkill: vi.fn(),
  updateSkillRelease: vi.fn(),
  withdrawSkill: vi.fn(),
  deprecateSkillRelease: vi.fn(),
  withdrawSkillRelease: vi.fn(),
  getAdminSkillProjection: vi.fn(),
  getAdminSkillRelease: vi.fn(),
  listAdminSkills: vi.fn(),
  getSkillReadiness: vi.fn(),
  getSkillReleaseReadiness: vi.fn(),
  publishSkillRelease: vi.fn(),
  publishSkillInformationBundle: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({
  requireAgent: mocks.requireAgent,
  requireDestructiveConfirmation: mocks.requireDestructiveConfirmation,
}));
vi.mock("@/lib/services/skill-release-service", async (importOriginal) => ({
  ...await importOriginal<typeof SkillReleaseServiceModule>(),
  createSkill: mocks.createSkill,
  createSkillRelease: mocks.createSkillRelease,
  updateSkill: mocks.updateSkill,
  updateSkillRelease: mocks.updateSkillRelease,
  withdrawSkill: mocks.withdrawSkill,
  deprecateSkillRelease: mocks.deprecateSkillRelease,
  withdrawSkillRelease: mocks.withdrawSkillRelease,
  getAdminSkillProjection: mocks.getAdminSkillProjection,
  getAdminSkillRelease: mocks.getAdminSkillRelease,
  listAdminSkills: mocks.listAdminSkills,
  getSkillReadiness: mocks.getSkillReadiness,
  getSkillReleaseReadiness: mocks.getSkillReleaseReadiness,
  publishSkillRelease: mocks.publishSkillRelease,
}));
vi.mock("@/lib/services/publication-bundle-service", () => ({
  publishSkillInformationBundle: mocks.publishSkillInformationBundle,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

const skillsRoute = await import("@/app/api/agent/skills/route");
const skillDetailRoute = await import("@/app/api/agent/skills/[id]/route");
const skillReadinessRoute = await import("@/app/api/agent/skills/[id]/readiness/route");
const skillPublishRoute = await import("@/app/api/agent/skills/[id]/publish/route");
const skillWithdrawRoute = await import("@/app/api/agent/skills/[id]/withdraw/route");
const skillReleasesRoute = await import("@/app/api/agent/skills/[id]/releases/route");
const releaseDetailRoute = await import("@/app/api/agent/skill-releases/[releaseId]/route");
const releaseReadinessRoute = await import("@/app/api/agent/skill-releases/[releaseId]/readiness/route");
const releasePublishRoute = await import("@/app/api/agent/skill-releases/[releaseId]/publish/route");
const releaseSkillOnlyPublishRoute = await import("@/app/api/agent/skill-releases/[releaseId]/publish-skill-only/route");
const releaseDeprecateRoute = await import("@/app/api/agent/skill-releases/[releaseId]/deprecate/route");
const releaseWithdrawRoute = await import("@/app/api/agent/skill-releases/[releaseId]/withdraw/route");

const skillInput = {
  slug: "cabai-monitor",
  title: "CabAI Monitor",
  summary: "Monitor CabAI safely.",
  tags: ["monitoring"],
};
const releaseInput = {
  skillId: "skill-1",
  version: "1.0.0",
  compatibility: "Codex >= 1",
  contentMarkdown: "## Usage\n\nUse the Skill.",
  license: "MIT",
  changelogMarkdown: "Initial release",
  accessPolicy: "authenticated" as const,
};
const publishInput = {
  skillId: "skill-1",
  releaseId: "release-1",
  informationId: "information-1",
  expectedSkillRevision: 2,
  expectedReleaseRevision: 3,
  expectedInformationRevision: 4,
};
const publishSkillOnlyInput = {
  skillId: "skill-1",
  releaseId: "release-1",
  expectedSkillRevision: 2,
  expectedReleaseRevision: 3,
};

function success<T>(value: T) {
  return { ok: true as const, value };
}

function notFound(message: string) {
  return { ok: false as const, kind: "not-found" as const, message };
}

function request(path: string, method: string, body?: unknown, headers: HeadersInit = {}) {
  return new Request(`https://example.com${path}`, {
    method,
    headers: body === undefined
      ? headers
      : { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const skillContext = (id = "skill-1") => ({ params: Promise.resolve({ id }) });
const releaseContext = (releaseId = "release-1") => ({ params: Promise.resolve({ releaseId }) });
const publishHeaders = (entityId: string, key = "publish-key") => ({
  "idempotency-key": key,
  "x-confirm-destructive": "true",
  "x-confirm-entity-id": entityId,
});

describe("Skill Admin Agent route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgent.mockResolvedValue({
      keyId: "key-1",
      agentId: "agent-key:key-1",
      name: "Skill Agent",
      permissions: [],
    });
    mocks.requireDestructiveConfirmation.mockImplementation((req: Request, expected?: string) => {
      if (
        req.headers.get("x-confirm-destructive") !== "true"
        || (expected && req.headers.get("x-confirm-entity-id") !== expected)
      ) {
        throw Response.json({ error: "Confirmation required" }, { status: 428 });
      }
    });
    mocks.getAdminSkillProjection.mockResolvedValue(notFound("Skill not found"));
    mocks.getAdminSkillRelease.mockResolvedValue(notFound("Skill release not found"));
    mocks.listAdminSkills.mockResolvedValue(success([]));
    mocks.getSkillReadiness.mockResolvedValue(success({ ready: true, issues: [] }));
    mocks.getSkillReleaseReadiness.mockResolvedValue(success({ ready: true, issues: [] }));
    mocks.publishSkillRelease.mockResolvedValue(success({
      skill: { id: "skill-1" },
      release: { id: "release-1" },
    }));
    mocks.createSkill.mockImplementation((input, _actor, options) => success({
      id: options.resourceId,
      ...input,
      status: "draft",
      revision: 1,
    }));
    mocks.createSkillRelease.mockImplementation((input, _actor, options) => success({
      id: options.resourceId,
      ...input,
      status: "draft",
      revision: 1,
    }));
    mocks.updateSkill.mockResolvedValue(success({ id: "skill-1" }));
    mocks.updateSkillRelease.mockResolvedValue(success({ id: "release-1" }));
    mocks.withdrawSkill.mockResolvedValue(success({ id: "skill-1", status: "withdrawn" }));
    mocks.deprecateSkillRelease.mockResolvedValue(success({ id: "release-1", status: "deprecated" }));
    mocks.withdrawSkillRelease.mockResolvedValue(success({ id: "release-1", status: "withdrawn" }));
    mocks.publishSkillInformationBundle.mockResolvedValue(success({
      skill: { id: "skill-1" },
      release: { id: "release-1" },
      information: { id: "information-1" },
    }));
  });

  it("enforces the read, write, and publish scope split on every route", async () => {
    const cases: Array<[string, () => Response | Promise<Response>, string]> = [
      ["list skills", () => skillsRoute.GET(request("/api/agent/skills", "GET")), "skill:read"],
      ["create skill", () => skillsRoute.POST(request("/api/agent/skills", "POST", skillInput, { "idempotency-key": "create-skill" })), "skill:write"],
      ["get skill", () => skillDetailRoute.GET(request("/api/agent/skills/skill-1", "GET"), skillContext()), "skill:read"],
      ["patch skill", () => skillDetailRoute.PATCH(request("/api/agent/skills/skill-1", "PATCH", { expectedRevision: 1, title: "Updated" }), skillContext()), "skill:write"],
      ["skill readiness", () => skillReadinessRoute.POST(request("/api/agent/skills/skill-1/readiness", "POST"), skillContext()), "skill:read"],
      ["list releases", () => skillReleasesRoute.GET(request("/api/agent/skills/skill-1/releases", "GET"), skillContext()), "skill:read"],
      ["create release", () => skillReleasesRoute.POST(request("/api/agent/skills/skill-1/releases", "POST", releaseInput, { "idempotency-key": "create-release" }), skillContext()), "skill:write"],
      ["get release", () => releaseDetailRoute.GET(request("/api/agent/skill-releases/release-1", "GET"), releaseContext()), "skill:read"],
      ["patch release", () => releaseDetailRoute.PATCH(request("/api/agent/skill-releases/release-1", "PATCH", { expectedRevision: 1, version: "1.0.1" }), releaseContext()), "skill:write"],
      ["release readiness", () => releaseReadinessRoute.POST(request("/api/agent/skill-releases/release-1/readiness", "POST"), releaseContext()), "skill:read"],
      ["publish skill", () => skillPublishRoute.POST(request("/api/agent/skills/skill-1/publish", "POST", publishInput, publishHeaders("skill-1")), skillContext()), "skill:publish"],
      ["withdraw skill", () => skillWithdrawRoute.POST(request("/api/agent/skills/skill-1/withdraw", "POST", { expectedRevision: 2 }, publishHeaders("skill-1")), skillContext()), "skill:publish"],
      ["publish release", () => releasePublishRoute.POST(request("/api/agent/skill-releases/release-1/publish", "POST", publishInput, publishHeaders("release-1")), releaseContext()), "skill:publish"],
      ["publish Skill only", () => releaseSkillOnlyPublishRoute.POST(request("/api/agent/skill-releases/release-1/publish-skill-only", "POST", publishSkillOnlyInput, publishHeaders("release-1")), releaseContext()), "skill:publish"],
      ["deprecate release", () => releaseDeprecateRoute.POST(request("/api/agent/skill-releases/release-1/deprecate", "POST", { expectedRevision: 3 }, publishHeaders("release-1")), releaseContext()), "skill:publish"],
      ["withdraw release", () => releaseWithdrawRoute.POST(request("/api/agent/skill-releases/release-1/withdraw", "POST", { expectedRevision: 3 }, publishHeaders("release-1")), releaseContext()), "skill:publish"],
    ];

    for (const [label, invoke, scope] of cases) {
      mocks.requireAgent.mockClear();
      await invoke();
      expect(mocks.requireAgent, label).toHaveBeenCalledWith(expect.any(Request), scope);
    }
  });

  it("makes both publish aliases call the same governed bundle with full identity", async () => {
    await skillPublishRoute.POST(
      request("/api/agent/skills/skill-1/publish", "POST", publishInput, publishHeaders("skill-1")),
      skillContext(),
    );
    await releasePublishRoute.POST(
      request("/api/agent/skill-releases/release-1/publish", "POST", publishInput, publishHeaders("release-1")),
      releaseContext(),
    );

    const expected = {
      ...publishInput,
      actor: { type: "agent", id: "agent-key:key-1", name: "Skill Agent" },
      idempotencyKey: "publish-key",
    };
    expect(mocks.publishSkillInformationBundle).toHaveBeenNthCalledWith(1, expected);
    expect(mocks.publishSkillInformationBundle).toHaveBeenNthCalledWith(2, expected);
    expect(mocks.requireDestructiveConfirmation).toHaveBeenNthCalledWith(1, expect.any(Request), "skill-1");
    expect(mocks.requireDestructiveConfirmation).toHaveBeenNthCalledWith(2, expect.any(Request), "release-1");
  });

  it("publishes a Skill release without creating an Information item", async () => {
    const response = await releaseSkillOnlyPublishRoute.POST(
      request(
        "/api/agent/skill-releases/release-1/publish-skill-only",
        "POST",
        publishSkillOnlyInput,
        publishHeaders("release-1", "skill-only-publish-key"),
      ),
      releaseContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.publishSkillRelease).toHaveBeenCalledWith(
      publishSkillOnlyInput,
      { type: "agent", id: "agent-key:key-1", name: "Skill Agent" },
    );
    expect(mocks.publishSkillInformationBundle).not.toHaveBeenCalled();
  });

  it("rejects path/body mismatch before publishing and enforces confirmation on lifecycle changes", async () => {
    const mismatch = await skillPublishRoute.POST(
      request("/api/agent/skills/other/publish", "POST", publishInput, publishHeaders("other")),
      skillContext("other"),
    );
    expect(mismatch.status).toBe(409);
    expect(mocks.publishSkillInformationBundle).not.toHaveBeenCalled();

    const missingConfirmation = await releaseDeprecateRoute.POST(
      request("/api/agent/skill-releases/release-1/deprecate", "POST", { expectedRevision: 3 }),
      releaseContext(),
    );
    expect(missingConfirmation.status).toBe(428);
    expect(mocks.deprecateSkillRelease).not.toHaveBeenCalled();
  });

  it("requires confirmation and forwards the idempotency key for published Skill metadata updates", async () => {
    mocks.getAdminSkillProjection.mockResolvedValue(success({
      skill: { id: "skill-1", status: "published" },
      releases: [],
    }));

    const response = await skillDetailRoute.PATCH(
      request(
        "/api/agent/skills/skill-1",
        "PATCH",
        { expectedRevision: 7, title: "PlanSeal｜可驗證技術規劃", summary: "繁中摘要", tags: ["planning"] },
        {
          "idempotency-key": "skill-metadata-update",
          "x-confirm-destructive": "true",
          "x-confirm-entity-id": "skill-1",
        },
      ),
      skillContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request), "skill-1");
    expect(mocks.updateSkill).toHaveBeenCalledWith(
      "skill-1",
      expect.objectContaining({ expectedRevision: 7, title: "PlanSeal｜可驗證技術規劃" }),
      { type: "agent", id: "agent-key:key-1", name: "Skill Agent" },
      { allowPublishedMetadata: true, idempotencyKey: "skill-metadata-update" },
    );
  });

  it("creates Skills idempotently and rejects key reuse with a different payload", async () => {
    const headers = { "idempotency-key": "same-skill-key" };
    const first = await skillsRoute.POST(request("/api/agent/skills", "POST", skillInput, headers));
    expect(first.status).toBe(201);
    const created = await first.json() as { data: typeof skillInput & { id: string } };
    expect(created.data.id).toMatch(/^idem_[0-9a-f]{48}$/);

    mocks.getAdminSkillProjection.mockResolvedValue(success({ skill: created.data, releases: [] }));
    const replay = await skillsRoute.POST(request("/api/agent/skills", "POST", skillInput, headers));
    expect(replay.status).toBe(200);
    expect(mocks.createSkill).toHaveBeenCalledTimes(1);

    const mismatch = await skillsRoute.POST(request("/api/agent/skills", "POST", { ...skillInput, title: "Different" }, headers));
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({ kind: "conflict" });
  });

  it("creates Skill releases idempotently and rejects key reuse with a different payload", async () => {
    const headers = { "idempotency-key": "same-release-key" };
    const first = await skillReleasesRoute.POST(
      request("/api/agent/skills/skill-1/releases", "POST", releaseInput, headers),
      skillContext(),
    );
    expect(first.status).toBe(201);
    const created = await first.json() as { data: typeof releaseInput & { id: string } };
    expect(created.data.id).toMatch(/^idem_[0-9a-f]{48}$/);

    mocks.getAdminSkillRelease.mockResolvedValue(success(created.data));
    const replay = await skillReleasesRoute.POST(
      request("/api/agent/skills/skill-1/releases", "POST", releaseInput, headers),
      skillContext(),
    );
    expect(replay.status).toBe(200);
    expect(mocks.createSkillRelease).toHaveBeenCalledTimes(1);

    const mismatch = await skillReleasesRoute.POST(
      request("/api/agent/skills/skill-1/releases", "POST", { ...releaseInput, version: "2.0.0" }, headers),
      skillContext(),
    );
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({ kind: "conflict" });
  });
});
