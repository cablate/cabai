import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), requireAgent: vi.fn(), findMedia: vi.fn(), findUser: vi.fn(),
  head: vi.fn(), update: vi.fn(), bind: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/agent-auth", async () => ({
  requireAgent: mocks.requireAgent,
  hasAgentPermission: (await import("@/lib/agent-permissions")).hasAgentPermission,
}));
vi.mock("@/lib/db", () => ({ db: {
  query: {
    users: { findFirst: mocks.findUser },
    agentApiKeys: { findFirst: vi.fn(async () => ({ createdBy: "owner-1" })) },
    media: { findFirst: mocks.findMedia },
    skillReleases: { findFirst: vi.fn(async () => ({ id: "release-1" })) },
  }, update: mocks.update,
} }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ head: mocks.head }) }));
vi.mock("@/lib/services/skill-artifact-service", () => ({ bindAndValidateDraftSkillArtifact: mocks.bind }));
import { POST } from "./route";

const body = { storageKey: "synthetic.zip", entityType: "skillRelease", entityId: "release-1", expectedEntityRevision: 1 };
function request(input = body) {
  return new Request("https://example.com/api/upload/confirm", {
    method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" }, body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.requireAgent.mockResolvedValue({ keyId: "key-1", permissions: ["media:write"] });
  mocks.findMedia.mockResolvedValue({ id: "media-1", status: "confirmed", context: "skill-artifact", entityType: "skillRelease", entityId: "release-1" });
  mocks.bind.mockResolvedValue({ ok: true });
  mocks.findUser.mockResolvedValue({ role: "admin" });
});
describe("Skill confirmation requires entity write authority", () => {
  it.each(["pending", "confirmed"])("rejects media-only keys before reads/writes for %s media", async (status) => {
    mocks.findMedia.mockResolvedValue({ status });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Insufficient permissions. Required: skill:write" });
    expect(mocks.findMedia).not.toHaveBeenCalled();
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.requireAgent).toHaveBeenCalledTimes(1);
    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "media:write");
  });
  it("permits a key holding both scopes without charging auth twice", async () => {
    mocks.requireAgent.mockResolvedValue({ keyId: "key-1", permissions: ["media:write", "skill:write"] });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.bind).toHaveBeenCalledWith({ releaseId: "release-1", mediaId: "media-1", expectedRevision: 1 });
    expect(mocks.requireAgent).toHaveBeenCalledTimes(1);
  });
  it("preserves same-origin database-admin confirmation", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.requireAgent).not.toHaveBeenCalled();
    expect(mocks.bind).toHaveBeenCalled();
  });
  it("does not require skill scope for ordinary unbound media", async () => {
    mocks.findMedia.mockResolvedValue({ id: "media-1", status: "confirmed", context: "plan-cover", entityType: null, entityId: null });
    const req = new Request("https://example.com/api/upload/confirm", { method: "POST", body: JSON.stringify({ storageKey: "cover.png" }) });
    expect((await POST(req)).status).toBe(200);
    expect(mocks.bind).not.toHaveBeenCalled();
  });
});
