import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rejectInvalidSuppliedPublicCredential: vi.fn(),
  requireUserToken: vi.fn(),
  getPublicSkillReleaseProjection: vi.fn(),
  createSkillArtifactDownload: vi.fn(),
}));

vi.mock("@/lib/agent/public-user-route", () => ({
  rejectInvalidSuppliedPublicCredential: mocks.rejectInvalidSuppliedPublicCredential,
}));
vi.mock("@/lib/user-auth", () => ({ requireUserToken: mocks.requireUserToken }));
vi.mock("@/lib/services/skill-release-service", () => ({
  getPublicSkillReleaseProjection: mocks.getPublicSkillReleaseProjection,
}));
vi.mock("@/lib/services/skill-artifact-service", () => ({
  createSkillArtifactDownload: mocks.createSkillArtifactDownload,
}));

import { GET as publicDownload } from "@/app/api/agent/public/v1/skills/[idOrSlug]/releases/[version]/download/route";
import { GET as userDownload } from "@/app/api/agent/user/v1/skills/[id]/releases/[version]/download/route";

const githubDistribution = {
  mode: "github" as const,
  repositoryUrl: "https://github.com/cablate/example-skill",
  sourceVerifiedAt: new Date("2026-08-04T00:00:00.000Z"),
  sourceBrowseUrl: `https://github.com/cablate/example-skill/tree/${"a".repeat(40)}`,
  installGuideUrl: `https://github.com/cablate/example-skill/blob/${"a".repeat(40)}/install/AGENT-INSTALL.md`,
  sourceArchiveUrl: `https://github.com/cablate/example-skill/archive/${"a".repeat(40)}.zip`,
  releaseUrl: "https://github.com/cablate/example-skill/releases/tag/v1.0.0",
};

describe("Skill Agent download distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rejectInvalidSuppliedPublicCredential.mockResolvedValue(undefined);
    mocks.requireUserToken.mockResolvedValue({ userId: "user-1" });
    mocks.getPublicSkillReleaseProjection.mockResolvedValue({
      ok: true,
      value: { id: "release-1", distribution: githubDistribution },
    });
  });

  it("returns the pinned GitHub archive for the public operation", async () => {
    const response = await publicDownload(
      new Request("https://cabai.example/api/agent/public/v1/skills/example/releases/1/download"),
      { params: Promise.resolve({ idOrSlug: "example", version: "1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        source: "github",
        url: githubDistribution.sourceArchiveUrl,
        expiresIn: null,
      },
    });
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });

  it("returns the same canonical GitHub source for a User Agent", async () => {
    const response = await userDownload(
      new Request("https://cabai.example/api/agent/user/v1/skills/skill-1/releases/1/download"),
      { params: Promise.resolve({ id: "skill-1", version: "1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireUserToken).toHaveBeenCalledWith(expect.any(Request), "skill:read");
    await expect(response.json()).resolves.toMatchObject({
      data: { source: "github", url: githubDistribution.sourceArchiveUrl },
    });
    expect(mocks.createSkillArtifactDownload).not.toHaveBeenCalled();
  });
});
