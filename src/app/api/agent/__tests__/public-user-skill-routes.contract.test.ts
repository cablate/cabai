import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SkillArtifactServiceModule from "@/lib/services/skill-artifact-service";
import type * as SkillReleaseServiceModule from "@/lib/services/skill-release-service";

const mocks = vi.hoisted(() => ({
  rejectInvalidSuppliedPublicCredential: vi.fn(),
  requireUserToken: vi.fn(),
  listPublicSkillSummaries: vi.fn(),
  getPublicSkillProjection: vi.fn(),
  getPublicSkillReleaseProjection: vi.fn(),
  createSkillArtifactDownload: vi.fn(),
}));

vi.mock("@/lib/agent/public-user-route", () => ({
  rejectInvalidSuppliedPublicCredential: mocks.rejectInvalidSuppliedPublicCredential,
}));
vi.mock("@/lib/user-auth", () => ({ requireUserToken: mocks.requireUserToken }));
vi.mock("@/lib/services/skill-release-service", async (importOriginal) => ({
  ...await importOriginal<typeof SkillReleaseServiceModule>(),
  listPublicSkillSummaries: mocks.listPublicSkillSummaries,
  getPublicSkillProjection: mocks.getPublicSkillProjection,
  getPublicSkillReleaseProjection: mocks.getPublicSkillReleaseProjection,
}));
vi.mock("@/lib/services/skill-artifact-service", async (importOriginal) => ({
  ...await importOriginal<typeof SkillArtifactServiceModule>(),
  createSkillArtifactDownload: mocks.createSkillArtifactDownload,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

const publicListRoute = await import("@/app/api/agent/public/v1/skills/route");
const publicDetailRoute = await import("@/app/api/agent/public/v1/skills/[idOrSlug]/route");
const publicReleaseRoute = await import("@/app/api/agent/public/v1/skills/[idOrSlug]/releases/[version]/route");
const publicDownloadRoute = await import("@/app/api/agent/public/v1/skills/[idOrSlug]/releases/[version]/download/route");
const userReleaseRoute = await import("@/app/api/agent/user/v1/skills/[id]/releases/[version]/route");
const userDownloadRoute = await import("@/app/api/agent/user/v1/skills/[id]/releases/[version]/download/route");

function success<T>(value: T) {
  return { ok: true as const, value };
}

function failure(kind: "not-found" | "forbidden", message: string) {
  return { ok: false as const, kind, message };
}

function request(path: string, authorization?: string) {
  return new Request(`https://example.com${path}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

const publicContext = (idOrSlug = "cabai-monitor", version = "1.0.0") => ({
  params: Promise.resolve({ idOrSlug, version }),
});
const publicDetailContext = (idOrSlug = "cabai-monitor") => ({
  params: Promise.resolve({ idOrSlug }),
});
const userContext = (id = "skill-1", version = "1.0.0") => ({
  params: Promise.resolve({ id, version }),
});

const publicRelease = {
  id: "release-public",
  skillId: "skill-1",
  version: "1.0.0",
  distribution: { mode: "hosted" as const },
  accessPolicy: "public" as const,
  downloadableForViewer: true,
};
const authenticatedRelease = {
  ...publicRelease,
  id: "release-authenticated",
  accessPolicy: "authenticated" as const,
  downloadRequiresAuthentication: true,
  downloadableForViewer: false,
};
const download = {
  url: "https://download.example/signed",
  expiresIn: 300,
  filename: "skill.zip",
  contentType: "application/zip",
  contentLength: 123,
  checksumSha256: "a".repeat(64),
};

describe("Public and User Skill Agent route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rejectInvalidSuppliedPublicCredential.mockResolvedValue(undefined);
    mocks.requireUserToken.mockResolvedValue({
      userId: "user-1",
      tokenId: "token-1",
      scopes: ["course:read", "skill:read", "information:read", "information:ack"],
    });
    mocks.listPublicSkillSummaries.mockResolvedValue(success([]));
    mocks.getPublicSkillProjection.mockResolvedValue(success({ id: "skill-1", slug: "cabai-monitor" }));
    mocks.getPublicSkillReleaseProjection.mockResolvedValue(success(publicRelease));
    mocks.createSkillArtifactDownload.mockResolvedValue(success(download));
  });

  it("keeps public list and detail anonymous and passes exact canonical service arguments", async () => {
    const auth = "Bearer cab_user_valid";
    const listResponse = await publicListRoute.GET(request("/api/agent/public/v1/skills", auth));
    const detailResponse = await publicDetailRoute.GET(
      request("/api/agent/public/v1/skills/cabai-monitor", auth),
      publicDetailContext(),
    );

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(mocks.rejectInvalidSuppliedPublicCredential).toHaveBeenCalledTimes(2);
    expect(mocks.listPublicSkillSummaries).toHaveBeenCalledWith({ authenticated: false });
    expect(mocks.getPublicSkillProjection).toHaveBeenCalledWith(
      "cabai-monitor",
      { authenticated: false },
    );
  });

  it("returns 401 for an invalid supplied public credential without anonymous downgrade", async () => {
    mocks.rejectInvalidSuppliedPublicCredential.mockRejectedValue(
      Response.json({ error: "Invalid, revoked, or expired token" }, { status: 401 }),
    );

    const responses = await Promise.all([
      publicListRoute.GET(request("/api/agent/public/v1/skills", "Bearer invalid")),
      publicDetailRoute.GET(
        request("/api/agent/public/v1/skills/cabai-monitor", "Bearer invalid"),
        publicDetailContext(),
      ),
      publicReleaseRoute.GET(
        request("/api/agent/public/v1/skills/cabai-monitor/releases/1.0.0", "Bearer invalid"),
        publicContext(),
      ),
      publicDownloadRoute.GET(
        request("/api/agent/public/v1/skills/cabai-monitor/releases/1.0.0/download", "Bearer invalid"),
        publicContext(),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(mocks.rejectInvalidSuppliedPublicCredential).toHaveBeenCalledTimes(4);
    expect(mocks.listPublicSkillSummaries).not.toHaveBeenCalled();
    expect(mocks.getPublicSkillProjection).not.toHaveBeenCalled();
    expect(mocks.getPublicSkillReleaseProjection).not.toHaveBeenCalled();
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });

  it("keeps the public collection summary content-free while detail remains full", async () => {
    const summary = {
      id: "skill-1",
      slug: "cabai-monitor",
      title: "CabAI Monitor",
      summary: "Monitors a CabAI deployment.",
      tags: ["monitoring"],
      publishedAt: new Date("2026-07-16T00:00:00Z"),
      currentRelease: {
        id: "release-public",
        skillId: "skill-1",
        version: "1.0.0",
        checksumSha256: "a".repeat(64),
        compatibility: "Codex >= 1",
        license: "MIT",
        accessPolicy: "public" as const,
        status: "published" as const,
        publishedAt: new Date("2026-07-16T00:00:00Z"),
        deprecatedAt: null,
        downloadRequiresAuthentication: false,
        downloadableForViewer: true,
      },
    };
    const detail = {
      ...summary,
      currentRelease: {
        ...summary.currentRelease,
        contentMarkdown: "## How to use\n\nRun the planning workflow.",
        changelogMarkdown: "Initial release",
      },
      releases: [],
    };
    mocks.listPublicSkillSummaries.mockResolvedValue(success([summary]));
    mocks.getPublicSkillProjection.mockResolvedValue(success(detail));

    const listResponse = await publicListRoute.GET(request("/api/agent/public/v1/skills"));
    const detailResponse = await publicDetailRoute.GET(
      request("/api/agent/public/v1/skills/cabai-monitor"),
      publicDetailContext(),
    );
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listBody.data[0]).toEqual(JSON.parse(JSON.stringify(summary)));
    expect(listBody.data[0]).not.toHaveProperty("releases");
    expect(listBody.data[0].currentRelease).not.toHaveProperty("contentMarkdown");
    expect(detailBody.data).toEqual(JSON.parse(JSON.stringify(detail)));
    expect(detailBody.data.currentRelease.contentMarkdown).toContain("How to use");
    expect(mocks.listPublicSkillSummaries).toHaveBeenCalledWith({ authenticated: false });
    expect(mocks.getPublicSkillProjection).toHaveBeenCalledWith(
      "cabai-monitor",
      { authenticated: false },
    );
  });

  it("looks up public release metadata by id-or-slug and version and hides missing releases", async () => {
    const found = await publicReleaseRoute.GET(
      request("/api/agent/public/v1/skills/cabai-monitor/releases/1.0.0"),
      publicContext(),
    );
    expect(found.status).toBe(200);
    expect(mocks.getPublicSkillReleaseProjection).toHaveBeenCalledWith(
      "cabai-monitor",
      "1.0.0",
      { authenticated: false },
    );

    mocks.getPublicSkillReleaseProjection.mockResolvedValueOnce(
      failure("not-found", "Skill release not found"),
    );
    const missing = await publicReleaseRoute.GET(
      request("/api/agent/public/v1/skills/missing/releases/1.0.0"),
      publicContext("missing"),
    );
    expect(missing.status).toBe(404);
  });

  it("never upgrades an authenticated-policy download on the public route", async () => {
    mocks.getPublicSkillReleaseProjection.mockResolvedValue(success(authenticatedRelease));
    mocks.createSkillArtifactDownload.mockResolvedValue(
      failure("forbidden", "This Skill release requires authentication"),
    );

    for (const authorization of [undefined, "Bearer cab_user_valid"]) {
      const response = await publicDownloadRoute.GET(
        request("/api/agent/public/v1/skills/cabai-monitor/releases/1.0.0/download", authorization),
        publicContext(),
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.getPublicSkillReleaseProjection).toHaveBeenNthCalledWith(
      1,
      "cabai-monitor",
      "1.0.0",
      { authenticated: false },
    );
    expect(mocks.createSkillArtifactDownload).toHaveBeenCalledTimes(2);
    expect(mocks.createSkillArtifactDownload).toHaveBeenNthCalledWith(1, {
      releaseId: "release-authenticated",
      authenticated: false,
    });
    expect(mocks.createSkillArtifactDownload).toHaveBeenNthCalledWith(2, {
      releaseId: "release-authenticated",
      authenticated: false,
    });
  });

  it("does not create a public download target for a missing or unpublished release", async () => {
    mocks.getPublicSkillReleaseProjection.mockResolvedValue(
      failure("not-found", "Skill release not found"),
    );
    const response = await publicDownloadRoute.GET(
      request("/api/agent/public/v1/skills/cabai-monitor/releases/draft/download"),
      publicContext("cabai-monitor", "draft"),
    );

    expect(response.status).toBe(404);
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });

  it("guards user release metadata with skill:read and uses the authenticated projection", async () => {
    const response = await userReleaseRoute.GET(
      request("/api/agent/user/v1/skills/skill-1/releases/1.0.0", "Bearer cab_user_valid"),
      userContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireUserToken).toHaveBeenCalledWith(expect.any(Request), "skill:read");
    expect(mocks.getPublicSkillReleaseProjection).toHaveBeenCalledWith(
      "skill-1",
      "1.0.0",
      { authenticated: true },
    );
  });

  it("creates user downloads through the canonical verifier with authenticated access", async () => {
    mocks.getPublicSkillReleaseProjection.mockResolvedValue(success({
      ...authenticatedRelease,
      downloadableForViewer: true,
    }));
    const response = await userDownloadRoute.GET(
      request("/api/agent/user/v1/skills/skill-1/releases/1.0.0/download", "Bearer cab_user_valid"),
      userContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireUserToken).toHaveBeenCalledWith(expect.any(Request), "skill:read");
    expect(mocks.getPublicSkillReleaseProjection).toHaveBeenCalledWith(
      "skill-1",
      "1.0.0",
      { authenticated: true },
    );
    expect(mocks.createSkillArtifactDownload).toHaveBeenCalledWith({
      releaseId: "release-authenticated",
      authenticated: true,
    });
  });

  it("stops at the user scope guard and does not expose release or download data", async () => {
    mocks.requireUserToken.mockRejectedValue(
      Response.json({ error: "Insufficient permissions" }, { status: 403 }),
    );
    const response = await userDownloadRoute.GET(
      request("/api/agent/user/v1/skills/skill-1/releases/1.0.0/download", "Bearer cab_user_limited"),
      userContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.getPublicSkillReleaseProjection).not.toHaveBeenCalled();
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });
});
