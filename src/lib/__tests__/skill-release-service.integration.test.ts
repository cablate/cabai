import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, skillReleases, skills } from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  createSkill,
  createSkillRelease,
  deprecateSkillRelease,
  getAdminSkillProjection,
  getPublicSkillReleaseProjection,
  getPublicSkillProjection,
  publishSkillRelease,
  publishSkillReleaseInTransaction,
  updateSkill,
  updateSkillRelease,
  withdrawSkillRelease,
  type SkillReleaseArtifactPrerequisites,
} from "@/lib/services/skill-release-service";
import { bindAndValidateDraftSkillArtifact } from "@/lib/services/skill-artifact-service";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { MemoryStorageProvider, VALID_SKILL_ZIP } from "@/test/skill-artifact-fixture";

const actor = { type: "agent" as const, id: "agent-key:wp-02" };
const verifiedArtifact: SkillReleaseArtifactPrerequisites = {
  binding: "verified",
  storageHead: "verified",
  checksum: "verified",
  archive: "verified",
};

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

async function createArtifact(
  releaseId: string,
  storage: MemoryStorageProvider,
): Promise<string> {
  const user = await createTestUser({ email: `skill-${crypto.randomUUID()}@example.com` });
  const storageKey = `skills/${crypto.randomUUID()}.zip`;
  storage.put(storageKey, VALID_SKILL_ZIP);
  const [artifact] = await db.insert(media).values({
    storageKey,
    publicUrl: "/controlled-skill-download",
    filename: "skill.zip",
    mimeType: "application/zip",
    fileSize: VALID_SKILL_ZIP.byteLength,
    context: "skill-artifact",
    uploadedBy: user.id,
    status: "confirmed",
    entityType: "skillRelease",
    entityId: releaseId,
    confirmedAt: new Date(),
  }).returning({ id: media.id });
  return artifact!.id;
}

async function createReadyDraft(slug = `skill-${crypto.randomUUID()}`) {
  const storage = new MemoryStorageProvider();
  const skillResult = await createSkill({
    slug,
    title: "WP-02 Skill",
    summary: "Canonical Skill identity fixture.",
    tags: ["fixture"],
  }, actor);
  expect(skillResult.ok).toBe(true);
  if (!skillResult.ok) throw new Error(skillResult.message);

  const releaseResult = await createSkillRelease({
    skillId: skillResult.value.id,
    version: "1.0.0",
    compatibility: "Codex >= 1",
    license: "MIT",
    changelogMarkdown: "Initial release",
    accessPolicy: "authenticated",
  }, actor);
  expect(releaseResult.ok).toBe(true);
  if (!releaseResult.ok) throw new Error(releaseResult.message);
  const artifactMediaId = await createArtifact(releaseResult.value.id, storage);
  const bound = await bindAndValidateDraftSkillArtifact({
    releaseId: releaseResult.value.id,
    mediaId: artifactMediaId,
    expectedRevision: releaseResult.value.revision,
  }, storage);
  expect(bound.ok).toBe(true);
  if (!bound.ok) throw new Error(bound.message);
  return { skill: skillResult.value, release: bound.value.release, storage };
}

describe("Skill release canonical persistence", () => {
  it("accepts server-owned deterministic IDs for retry-safe Agent creates", async () => {
    const skillId = `idem_${"c".repeat(48)}`;
    const releaseId = `idem_${"d".repeat(48)}`;
    const skill = await createSkill({
      slug: "idempotent-skill",
      title: "Idempotent Skill",
      summary: "Created with a server-owned ID",
    }, actor, { resourceId: skillId });
    expect(skill).toMatchObject({ ok: true, value: { id: skillId } });
    const release = await createSkillRelease({
      skillId,
      version: "1.0.0",
    }, actor, { resourceId: releaseId });
    expect(release).toMatchObject({ ok: true, value: { id: releaseId, skillId } });
  });

  it("uses expectedRevision atomically and stale writers perform zero writes", async () => {
    const { skill } = await createReadyDraft();
    const updated = await updateSkill(skill.id, {
      expectedRevision: skill.revision,
      title: "Updated title",
    }, actor);
    expect(updated.ok).toBe(true);

    const stale = await updateSkill(skill.id, {
      expectedRevision: skill.revision,
      summary: "Must not persist",
    }, actor);
    expect(stale).toMatchObject({ ok: false, kind: "stale-revision" });
    const stored = await db.query.skills.findFirst({ where: eq(skills.id, skill.id) });
    expect(stored).toMatchObject({ title: "Updated title", summary: skill.summary, revision: 2 });
  });

  it("publishes Release and Skill current pointer in one transaction", async () => {
    const { skill, release, storage } = await createReadyDraft();
    vi.mocked(revalidateTag).mockClear();
    const published = await publishSkillRelease({
      skillId: skill.id,
      releaseId: release.id,
      expectedSkillRevision: skill.revision,
      expectedReleaseRevision: release.revision,
    }, actor, storage);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error(published.message);
    expect(published.value.skill).toMatchObject({
      status: "published",
      currentReleaseId: release.id,
      revision: skill.revision + 1,
    });
    expect(published.value.release).toMatchObject({ status: "published", revision: release.revision + 1 });
    expect(revalidateTag).toHaveBeenCalledWith("public-site-skills", { expire: 0 });
    expect(await getPublicSkillReleaseProjection(skill.id, release.version, { authenticated: false }))
      .toMatchObject({ ok: true, value: { id: release.id, downloadableForViewer: false } });
    expect(await getPublicSkillReleaseProjection(skill.slug, release.version, { authenticated: true }))
      .toMatchObject({ ok: true, value: { id: release.id, downloadableForViewer: true } });
  });

  it("publishes a GitHub-backed Skill without a CabAI artifact and updates its catalog independently", async () => {
    const createdSkill = await createSkill({
      slug: "github-backed-skill",
      title: "GitHub-backed Skill",
      summary: "Uses a canonical GitHub source.",
      bodyMarkdown: "## 第一版介紹",
      distributionMode: "github",
      sourceRepositoryUrl: "https://github.com/cablate/example-skill",
      sourceRef: "v1.0.0",
    }, actor);
    expect(createdSkill.ok).toBe(true);
    if (!createdSkill.ok) throw new Error(createdSkill.message);

    const createdRelease = await createSkillRelease({
      skillId: createdSkill.value.id,
      version: "catalog-1",
      compatibility: "Codex and Claude Code",
      license: "MIT",
      accessPolicy: "public",
    }, actor);
    expect(createdRelease.ok).toBe(true);
    if (!createdRelease.ok) throw new Error(createdRelease.message);

    const published = await publishSkillRelease({
      skillId: createdSkill.value.id,
      releaseId: createdRelease.value.id,
      expectedSkillRevision: createdSkill.value.revision,
      expectedReleaseRevision: createdRelease.value.revision,
    }, actor);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error(published.message);

    const publicProjection = await getPublicSkillProjection(createdSkill.value.slug, { authenticated: false });
    expect(publicProjection.ok).toBe(true);
    if (!publicProjection.ok) throw new Error(publicProjection.message);
    expect(publicProjection.value).toMatchObject({
      bodyMarkdown: "## 第一版介紹",
      currentRelease: {
        downloadableForViewer: false,
        distribution: {
          mode: "github",
          repositoryUrl: "https://github.com/cablate/example-skill",
        },
      },
    });
    expect(publicProjection.value.currentRelease).not.toHaveProperty("version");
    expect(publicProjection.value.currentRelease).not.toHaveProperty("checksumSha256");

    const informationSource = await buildInformationSourceBundle("skill_release", createdRelease.value.id);
    expect(informationSource).toMatchObject({
      ok: true,
      value: {
        title: "GitHub-backed Skill",
        actionTemplates: [{
          rel: "skill",
          operationId: "getPublicSkill",
          parameters: { idOrSlug: "github-backed-skill" },
        }],
      },
    });
    expect(informationSource.ok && informationSource.value.title).not.toContain("catalog-1");

    const updated = await updateSkill(createdSkill.value.id, {
      expectedRevision: published.value.skill.revision,
      bodyMarkdown: "## 修正後介紹",
    }, actor, { allowPublishedMetadata: true, idempotencyKey: "catalog-copy-update" });
    expect(updated).toMatchObject({ ok: true, value: { bodyMarkdown: "## 修正後介紹" } });

    const storedReleases = await db.query.skillReleases.findMany({
      where: eq(skillReleases.skillId, createdSkill.value.id),
    });
    expect(storedReleases).toHaveLength(1);
  });

  it("allows an outer coordinator to roll back the complete publication", async () => {
    const { skill, release } = await createReadyDraft();
    await expect(db.transaction(async (tx) => {
      const published = await publishSkillReleaseInTransaction(tx, {
        skillId: skill.id,
        releaseId: release.id,
        expectedSkillRevision: skill.revision,
        expectedReleaseRevision: release.revision,
      }, verifiedArtifact);
      expect(published.ok).toBe(true);
      throw new Error("required Information failed");
    })).rejects.toThrow("required Information failed");

    const [storedSkill, storedRelease] = await Promise.all([
      db.query.skills.findFirst({ where: eq(skills.id, skill.id) }),
      db.query.skillReleases.findFirst({ where: eq(skillReleases.id, release.id) }),
    ]);
    expect(storedSkill).toMatchObject({ status: "draft", currentReleaseId: null, revision: 1 });
    expect(storedRelease).toMatchObject({ status: "draft", revision: release.revision });
  });

  it("rejects cross-Skill publication before either row is written", async () => {
    const first = await createReadyDraft();
    const secondResult = await createSkill({
      slug: `other-${crypto.randomUUID()}`,
      title: "Other Skill",
      summary: "Different parent.",
    }, actor);
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error(secondResult.message);

    vi.mocked(revalidateTag).mockClear();
    const result = await publishSkillRelease({
      skillId: secondResult.value.id,
      releaseId: first.release.id,
      expectedSkillRevision: secondResult.value.revision,
      expectedReleaseRevision: first.release.revision,
    }, actor, first.storage);
    expect(result).toMatchObject({ ok: false, kind: "conflict" });
    expect(revalidateTag).not.toHaveBeenCalled();
    const release = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, first.release.id) });
    expect(release).toMatchObject({ status: "draft", revision: first.release.revision });
  });

  it("keeps published metadata immutable through deprecation and withdrawal", async () => {
    const { skill, release, storage } = await createReadyDraft();
    const published = await publishSkillRelease({
      skillId: skill.id,
      releaseId: release.id,
      expectedSkillRevision: skill.revision,
      expectedReleaseRevision: release.revision,
    }, actor, storage);
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error(published.message);

    const immutable = await updateSkillRelease(release.id, {
      expectedRevision: published.value.release.revision,
      version: "2.0.0",
      license: "Changed",
      compatibility: "Changed",
      changelogMarkdown: "Changed",
      accessPolicy: "public",
    }, actor);
    expect(immutable).toMatchObject({ ok: false, kind: "immutable" });

    const deprecated = await deprecateSkillRelease({
      releaseId: release.id,
      expectedRevision: published.value.release.revision,
    }, actor);
    expect(deprecated.ok && deprecated.value.status).toBe("deprecated");
    if (!deprecated.ok) throw new Error(deprecated.message);
    const visible = await getPublicSkillProjection(skill.slug, { authenticated: true });
    expect(visible.ok && visible.value.currentRelease.status).toBe("deprecated");

    const withdrawn = await withdrawSkillRelease({
      releaseId: release.id,
      expectedRevision: deprecated.value.revision,
    }, actor);
    expect(withdrawn.ok && withdrawn.value.status).toBe("withdrawn");
    expect(await getPublicSkillProjection(skill.slug, { authenticated: true }))
      .toMatchObject({ ok: false, kind: "not-found" });

    const admin = await getAdminSkillProjection(skill.id);
    expect(admin.ok && admin.value.releases[0]?.status).toBe("withdrawn");
  });
});
