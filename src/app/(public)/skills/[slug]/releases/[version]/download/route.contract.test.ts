import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getPublicSkillProjection: vi.fn(),
  createSkillArtifactDownload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/skill-release-service", () => ({
  getPublicSkillProjection: mocks.getPublicSkillProjection,
}));
vi.mock("@/lib/services/skill-artifact-service", () => ({
  createSkillArtifactDownload: mocks.createSkillArtifactDownload,
}));

import { GET } from "./route";

const release = {
  id: "release-1",
  version: "1.0.0",
  distribution: { mode: "hosted" as const },
};

function context(version = release.version) {
  return { params: Promise.resolve({ slug: "sample-skill", version }) };
}

describe("website Skill download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.getPublicSkillProjection.mockResolvedValue({
      ok: true,
      value: { releases: [release] },
    });
  });

  it("redirects only after canonical artifact verification succeeds", async () => {
    mocks.createSkillArtifactDownload.mockResolvedValue({
      ok: true,
      value: { url: "https://storage.example.test/signed" },
    });

    const response = await GET(new Request("https://site.example.test"), context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example.test/signed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createSkillArtifactDownload).toHaveBeenCalledWith({
      releaseId: release.id,
      authenticated: false,
    });
  });

  it("does not touch storage for a version outside the public projection", async () => {
    const response = await GET(new Request("https://site.example.test"), context("2.0.0"));

    expect(response.status).toBe(404);
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });

  it("keeps authenticated artifacts closed to anonymous visitors", async () => {
    mocks.createSkillArtifactDownload.mockResolvedValue({
      ok: false,
      kind: "forbidden",
      message: "Authentication required",
    });

    const response = await GET(new Request("https://site.example.test"), context());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("redirects GitHub-backed Skills to the complete pinned source without touching storage", async () => {
    mocks.getPublicSkillProjection.mockResolvedValue({
      ok: true,
      value: {
        releases: [{
          ...release,
          distribution: {
            mode: "github",
            sourceArchiveUrl: "https://github.com/cablate/example/archive/abc123.zip",
          },
        }],
      },
    });

    const response = await GET(new Request("https://site.example.test"), context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://github.com/cablate/example/archive/abc123.zip");
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });
});
