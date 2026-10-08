import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  requireDestructiveConfirmation: vi.fn(),
  buildInformationSourceBundle: vi.fn(),
  createInformationDraftFromSource: vi.fn(),
  getInformation: vi.fn(),
  listInformation: vi.fn(),
  updateInformationDraft: vi.fn(),
  validateInformationReadiness: vi.fn(),
  publishInformation: vi.fn(),
  withdrawInformation: vi.fn(),
  getInformationHistory: vi.fn(),
  getInformationStats: vi.fn(),
  getInformationCoverage: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({
  requireAgent: mocks.requireAgent,
  requireDestructiveConfirmation: mocks.requireDestructiveConfirmation,
}));
vi.mock("@/lib/information-sources", () => ({
  buildInformationSourceBundle: mocks.buildInformationSourceBundle,
}));
vi.mock("@/lib/services/information-service", () => ({
  createInformationDraftFromSource: mocks.createInformationDraftFromSource,
  getInformation: mocks.getInformation,
  listInformation: mocks.listInformation,
  updateInformationDraft: mocks.updateInformationDraft,
  validateInformationReadiness: mocks.validateInformationReadiness,
  publishInformation: mocks.publishInformation,
  withdrawInformation: mocks.withdrawInformation,
  getInformationHistory: mocks.getInformationHistory,
  getInformationStats: mocks.getInformationStats,
  getInformationCoverage: mocks.getInformationCoverage,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

import { GET as listInformationRoute, POST as createInformationRoute } from "@/app/api/agent/information/route";
import { POST as sourceDraftRoute } from "@/app/api/agent/information/drafts/from-source/route";
import { GET as coverageRoute } from "@/app/api/agent/information/coverage/route";
import { GET as getInformationRoute, PATCH as patchInformationRoute } from "@/app/api/agent/information/[id]/route";
import { POST as readinessRoute } from "@/app/api/agent/information/[id]/readiness/route";
import { POST as publishRoute } from "@/app/api/agent/information/[id]/publish/route";
import { POST as withdrawRoute } from "@/app/api/agent/information/[id]/withdraw/route";
import { GET as historyRoute } from "@/app/api/agent/information/[id]/history/route";
import { GET as statsRoute } from "@/app/api/agent/information/[id]/stats/route";

const authorInput = {
  sourceType: "api_operation" as const,
  sourceId: "getUserCourseContent",
  kind: "api.capability-added" as const,
  title: "Course content is available",
  summary: "Agents can now retrieve entitled course content.",
  whyItMatters: "This avoids scanning unrelated endpoints.",
  bodyMarkdown: "# Course content\n\nAgents can read the full announcement.",
  actionSelections: [{ rel: "api-capability" }],
  tags: ["course", "agent"],
};

const informationRow = {
  id: "information-1",
  dedupeKey: "api_operation:getUserCourseContent:v1:api.capability-added",
  sourceType: authorInput.sourceType,
  sourceId: authorInput.sourceId,
  sourceVersion: "v1",
  kind: authorInput.kind,
  title: authorInput.title,
  summary: authorInput.summary,
  whyItMatters: authorInput.whyItMatters,
  bodyMarkdown: authorInput.bodyMarkdown,
  audience: "all_users" as const,
  actions: [{
    rel: "api-capability",
    operationId: "getUserCourseContent",
    parameters: {},
    credential: "user" as const,
  }],
  tags: authorInput.tags,
  status: "draft" as const,
  revision: 1,
  publishedAt: null,
  expiresAt: null,
  withdrawnAt: null,
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
};

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://example.com/api/agent/information${path}`, init);
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return request(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function context(id = informationRow.id) {
  return { params: Promise.resolve({ id }) };
}

function lifecycleHeaders(id = informationRow.id) {
  return {
    "idempotency-key": `transition-${id}`,
    "x-confirm-destructive": "true",
    "x-confirm-entity-id": id,
  };
}

describe("Information Admin Agent route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgent.mockResolvedValue({
      keyId: "key-1",
      agentId: "agent-key:key-1",
      name: "Admin Agent",
      permissions: [],
    });
    mocks.requireDestructiveConfirmation.mockImplementation((req: Request, id?: string) => {
      if (req.headers.get("x-confirm-destructive") !== "true"
        || (id && req.headers.get("x-confirm-entity-id") !== id)) {
        throw new Response(JSON.stringify({ error: "Destructive confirmation required" }), {
          status: 428,
          headers: { "content-type": "application/json" },
        });
      }
    });
    mocks.buildInformationSourceBundle.mockResolvedValue({ ok: true, value: { sourceType: "api_operation", sourceId: authorInput.sourceId } });
    mocks.createInformationDraftFromSource.mockResolvedValue({ ok: true, value: informationRow });
    mocks.getInformation.mockResolvedValue({ ok: true, value: informationRow });
    mocks.listInformation.mockResolvedValue({ ok: true, value: [informationRow] });
    mocks.updateInformationDraft.mockResolvedValue({ ok: true, value: informationRow });
    mocks.validateInformationReadiness.mockResolvedValue({ ok: true, value: { ready: true, issues: [] } });
    mocks.publishInformation.mockResolvedValue({ ok: true, value: { ...informationRow, status: "published" } });
    mocks.withdrawInformation.mockResolvedValue({ ok: true, value: { ...informationRow, status: "withdrawn" } });
    mocks.getInformationHistory.mockResolvedValue([]);
    mocks.getInformationStats.mockResolvedValue({
      ok: true,
      value: { eligible: 8, read: 3, unread: 5, calculatedAt: new Date("2026-07-16T01:00:00.000Z") },
    });
    mocks.getInformationCoverage.mockResolvedValue({ ok: true, value: { calculatedAt: new Date(), issues: [] } });
  });

  it("uses the exact read, write and publish scopes for every Information surface", async () => {
    await listInformationRoute(request(""));
    await createInformationRoute(jsonRequest("", authorInput, { "idempotency-key": "create-1" }));
    await sourceDraftRoute(jsonRequest("/drafts/from-source", { sourceType: authorInput.sourceType, sourceId: authorInput.sourceId }));
    await getInformationRoute(request(`/${informationRow.id}`), context());
    await patchInformationRoute(jsonRequest(`/${informationRow.id}`, { title: "Updated", expectedRevision: 1 }, {}, "PATCH"), context());
    await readinessRoute(request(`/${informationRow.id}/readiness`, { method: "POST" }), context());
    await publishRoute(jsonRequest(`/${informationRow.id}/publish`, { expectedRevision: 1 }, lifecycleHeaders()), context());
    await withdrawRoute(jsonRequest(`/${informationRow.id}/withdraw`, { expectedRevision: 1 }, lifecycleHeaders()), context());
    await historyRoute(request(`/${informationRow.id}/history`), context());
    await statsRoute(request(`/${informationRow.id}/stats`), context());
    await coverageRoute(request("/coverage"));

    expect(mocks.requireAgent.mock.calls.map((call) => call[1])).toEqual([
      "information:read",
      "information:write",
      "information:write",
      "information:read",
      "information:write",
      "information:read",
      "information:publish",
      "information:publish",
      "information:read",
      "information:read",
      "information:read",
    ]);
  });

  it("prepares a source bundle without creating or updating Information", async () => {
    const response = await sourceDraftRoute(jsonRequest("/drafts/from-source", {
      sourceType: "course",
      sourceId: "course-1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.buildInformationSourceBundle).toHaveBeenCalledWith("course", "course-1");
    expect(mocks.createInformationDraftFromSource).not.toHaveBeenCalled();
    expect(mocks.updateInformationDraft).not.toHaveBeenCalled();
  });

  it("creates once, replays the exact payload, and rejects key reuse with a different payload", async () => {
    mocks.getInformation
      .mockResolvedValueOnce({ ok: false, kind: "not-found", message: "Information not found" })
      .mockResolvedValueOnce({ ok: true, value: informationRow })
      .mockResolvedValueOnce({ ok: true, value: informationRow });

    const first = await createInformationRoute(jsonRequest("", authorInput, { "idempotency-key": "stable-create" }));
    const replay = await createInformationRoute(jsonRequest("", authorInput, { "idempotency-key": "stable-create" }));
    const mismatch = await createInformationRoute(jsonRequest("", {
      ...authorInput,
      summary: "A different payload under the same key.",
    }, { "idempotency-key": "stable-create" }));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(mismatch.status).toBe(409);
    expect(mocks.createInformationDraftFromSource).toHaveBeenCalledTimes(1);
    expect(mocks.createInformationDraftFromSource).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: expect.stringMatching(/^idem_[a-f0-9]{48}$/),
    }));
  });

  it("maps missing confirmation, readiness failure and stale revision to 428, 422 and 409", async () => {
    const unconfirmed = await publishRoute(jsonRequest(`/${informationRow.id}/publish`, {
      expectedRevision: 1,
    }, { "idempotency-key": "publish-no-confirm" }), context());

    mocks.publishInformation.mockResolvedValueOnce({
      ok: false,
      kind: "validation-failed",
      message: "Information is not ready to publish",
      issues: [{ code: "broken_action", field: "actions", severity: "error", message: "Action unavailable" }],
    });
    const notReady = await publishRoute(jsonRequest(`/${informationRow.id}/publish`, {
      expectedRevision: 1,
    }, lifecycleHeaders()), context());

    mocks.updateInformationDraft.mockResolvedValueOnce({
      ok: false,
      kind: "stale-revision",
      message: "Information revision is stale",
    });
    const stale = await patchInformationRoute(jsonRequest(`/${informationRow.id}`, {
      title: "Updated",
      expectedRevision: 1,
    }, {}, "PATCH"), context());

    expect(unconfirmed.status).toBe(428);
    expect(notReady.status).toBe(422);
    expect(stale.status).toBe(409);
  });

  it("returns aggregate statistics without exposing user identities or read rows", async () => {
    const response = await statsRoute(request(`/${informationRow.id}/stats`), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        eligible: 8,
        read: 3,
        unread: 5,
        calculatedAt: "2026-07-16T01:00:00.000Z",
      },
    });
    expect(mocks.getInformationStats).toHaveBeenCalledWith(informationRow.id);
  });
});
