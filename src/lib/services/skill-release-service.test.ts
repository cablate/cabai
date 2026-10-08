import { describe, expect, it } from "vitest";
import type { Skill, SkillRelease } from "@/lib/db/schema";
import {
  createSkillInputSchema,
  skillReleaseVisibility,
  toPublicSkillCollectionProjection,
  toPublicSkillProjection,
  toPublicSkillReleaseProjection,
  updateSkillReleaseInputSchema,
  validateSkillReadiness,
  validateSkillReleaseReadiness,
  type SkillReleaseArtifactPrerequisites,
} from "./skill-release-service";

const verifiedArtifact: SkillReleaseArtifactPrerequisites = {
  binding: "verified",
  storageHead: "verified",
  checksum: "verified",
  archive: "verified",
};

function releaseFixture(status: SkillRelease["status"]): SkillRelease {
  const published = status !== "draft";
  return {
    id: `release-${status}`,
    skillId: "skill-1",
    version: "1.0.0",
    artifactMediaId: "media-1",
    checksumSha256: "a".repeat(64),
    artifactManifest: {
      skillMarkdownSha256: "b".repeat(64),
      name: "cabai-monitor",
      description: "Monitoring helper",
      fileCount: 1,
      uncompressedBytes: 128,
      paths: ["SKILL.md"],
    },
    artifactValidation: {
      valid: true,
      issues: [],
      validatedChecksumSha256: "a".repeat(64),
    },
    artifactValidatedAt: new Date("2026-07-16T00:00:00Z"),
    compatibility: "Codex >= 1",
    contentMarkdown: "## How to use\n\nRun the planning workflow.",
    license: "MIT",
    changelogMarkdown: "Initial release",
    accessPolicy: "authenticated",
    status,
    revision: 2,
    publishedAt: published ? new Date("2026-07-16T00:00:00Z") : null,
    deprecatedAt: status === "deprecated" ? new Date("2026-07-17T00:00:00Z") : null,
    withdrawnAt: status === "withdrawn" ? new Date("2026-07-18T00:00:00Z") : null,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    updatedAt: new Date("2026-07-16T00:00:00Z"),
  };
}

function skillFixture(currentReleaseId = "release-published"): Skill {
  return {
    id: "skill-1",
    slug: "cabai-monitor",
    title: "CabAI Monitor",
    summary: "Monitors a CabAI deployment.",
    tags: ["monitoring"],
    bodyMarkdown: "## CabAI Monitor",
    distributionMode: "hosted",
    sourceRepositoryUrl: null,
    sourceRef: null,
    sourceCommitSha: null,
    sourceVerifiedAt: null,
    status: "published",
    currentReleaseId,
    revision: 2,
    publishedAt: new Date("2026-07-16T00:00:00Z"),
    withdrawnAt: null,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    updatedAt: new Date("2026-07-16T00:00:00Z"),
  };
}

describe("Skill release input contract", () => {
  it("strictly rejects locked or unknown fields", () => {
    expect(createSkillInputSchema.safeParse({
      slug: "cabai-monitor",
      title: "CabAI Monitor",
      summary: "Monitoring helper.",
      status: "published",
    }).success).toBe(false);
    expect(updateSkillReleaseInputSchema.safeParse({
      expectedRevision: 1,
      status: "published",
    }).success).toBe(false);
    expect(updateSkillReleaseInputSchema.safeParse({
      expectedRevision: 1,
      artifactMediaId: "media-2",
      checksumSha256: "b".repeat(64),
    }).success).toBe(false);
  });

  it("normalizes defaults only for authorable create fields", () => {
    const parsed = createSkillInputSchema.parse({
      slug: "cabai-monitor",
      title: "CabAI Monitor",
      summary: "Monitoring helper.",
    });
    expect(parsed.tags).toEqual([]);
  });
});

describe("Skill and release readiness", () => {
  it("requires the Skill identity fields", () => {
    const result = validateSkillReadiness({
      slug: "Bad Slug",
      title: "",
      summary: "",
      distributionMode: "hosted",
      sourceRepositoryUrl: null,
      sourceRef: null,
      sourceCommitSha: null,
      sourceVerifiedAt: null,
    });
    expect(result.ready).toBe(false);
    expect(result.issues.map((entry) => [entry.code, entry.field])).toEqual(expect.arrayContaining([
      ["invalid_format", "slug"],
      ["required", "title"],
      ["required", "summary"],
    ]));
  });

  it("blocks publication until fresh WP-03 artifact evidence is supplied", () => {
    const release = releaseFixture("draft");
    const unavailable = validateSkillReleaseReadiness(release, {
      parentSkillExists: true,
      versionAvailable: true,
    });
    expect(unavailable.ready).toBe(false);
    expect(unavailable.issues.some((entry) => entry.field === "artifact.storageHead")).toBe(true);

    const verified = validateSkillReleaseReadiness(release, {
      parentSkillExists: true,
      versionAvailable: true,
      artifact: verifiedArtifact,
    });
    expect(verified).toEqual({ ready: true, issues: [] });
  });

  it("does not require a CabAI artifact for a GitHub-backed release", () => {
    const release = {
      ...releaseFixture("draft"),
      artifactMediaId: null,
      checksumSha256: null,
      artifactManifest: null,
      artifactValidation: null,
      artifactValidatedAt: null,
    };
    expect(validateSkillReleaseReadiness(release, {
      parentSkillExists: true,
      versionAvailable: true,
      distributionMode: "github",
    })).toEqual({ ready: true, issues: [] });
  });

  it("uses stable issue kinds for artifact failure evidence", () => {
    const result = validateSkillReleaseReadiness(releaseFixture("draft"), {
      parentSkillExists: true,
      versionAvailable: true,
      artifact: { ...verifiedArtifact, checksum: "invalid", archive: "invalid" },
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "checksum_mismatch", field: "artifact.checksum" }),
      expect.objectContaining({ code: "invalid_format", field: "artifact.archive" }),
    ]));
  });
});

describe("admin/public visibility projections", () => {
  it("makes release lifecycle visibility explicit", () => {
    expect(skillReleaseVisibility.draft).toMatchObject({ public: false, downloadable: false });
    expect(skillReleaseVisibility.published).toMatchObject({ public: true, downloadable: true });
    expect(skillReleaseVisibility.deprecated).toMatchObject({ public: true, downloadable: true, deprecated: true });
    expect(skillReleaseVisibility.withdrawn).toMatchObject({ public: false, downloadable: false });
  });

  it("keeps deprecated releases visible but gates authenticated downloads", () => {
    const deprecated = releaseFixture("deprecated");
    expect(toPublicSkillReleaseProjection(deprecated, { authenticated: false })).toMatchObject({
      status: "deprecated",
      contentMarkdown: "## How to use\n\nRun the planning workflow.",
      downloadRequiresAuthentication: true,
      downloadableForViewer: false,
    });
    expect(toPublicSkillReleaseProjection(deprecated, { authenticated: true }))
      .toMatchObject({ downloadableForViewer: true });
  });

  it("does not expose a CabAI version or checksum for a GitHub-backed release", () => {
    const projection = toPublicSkillReleaseProjection(
      { ...releaseFixture("published"), artifactMediaId: null, checksumSha256: null },
      { authenticated: false },
      {
        mode: "github",
        repositoryUrl: "https://github.com/cablate/example-skill",
        sourceVerifiedAt: new Date("2026-08-04T00:00:00.000Z"),
        sourceBrowseUrl: "https://github.com/cablate/example-skill/tree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        installGuideUrl: "https://github.com/cablate/example-skill/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/install/AGENT-INSTALL.md",
        sourceArchiveUrl: "https://github.com/cablate/example-skill/archive/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip",
        releaseUrl: "https://github.com/cablate/example-skill/releases/tag/v1.0.0",
      },
    );
    expect(projection).not.toHaveProperty("version");
    expect(projection).not.toHaveProperty("checksumSha256");
  });

  it("hides draft/withdrawn releases and a Skill without a visible current release", () => {
    expect(toPublicSkillReleaseProjection(releaseFixture("draft"), { authenticated: true })).toBeNull();
    expect(toPublicSkillReleaseProjection(releaseFixture("withdrawn"), { authenticated: true })).toBeNull();
    expect(toPublicSkillProjection(
      skillFixture("release-withdrawn"),
      [releaseFixture("withdrawn")],
      { authenticated: true },
    )).toBeNull();
  });

  it("keeps the Agent collection summary bounded to selection metadata and the current release", () => {
    const summary = toPublicSkillCollectionProjection(
      skillFixture(),
      releaseFixture("published"),
      { authenticated: false },
    );

    expect(summary).toMatchObject({
      id: "skill-1",
      slug: "cabai-monitor",
      currentRelease: {
        id: "release-published",
        version: "1.0.0",
        compatibility: "Codex >= 1",
        accessPolicy: "authenticated",
        downloadRequiresAuthentication: true,
        downloadableForViewer: false,
      },
    });
    expect(summary).not.toHaveProperty("releases");
    expect(summary).not.toHaveProperty("contentMarkdown");
    expect(summary?.currentRelease).not.toHaveProperty("contentMarkdown");
    expect(summary?.currentRelease).not.toHaveProperty("changelogMarkdown");
  });

  it("keeps the existing public service projection content-capable for website consumers", () => {
    const current = releaseFixture("published");
    const previous = { ...releaseFixture("deprecated"), id: "release-previous", version: "0.9.0" };
    const projection = toPublicSkillProjection(skillFixture(), [current, previous], { authenticated: true });

    expect(projection).toMatchObject({
      currentRelease: { contentMarkdown: "## How to use\n\nRun the planning workflow." },
      releases: expect.arrayContaining([
        expect.objectContaining({ id: "release-published", contentMarkdown: expect.any(String) }),
        expect.objectContaining({ id: "release-previous", changelogMarkdown: "Initial release" }),
      ]),
    });
  });
});
