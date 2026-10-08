import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, skillReleases } from "@/lib/db/schema";
import { StorageProviderError } from "@/lib/storage";
import {
  createSkill,
  createSkillRelease,
  publishSkillRelease,
} from "@/lib/services/skill-release-service";
import {
  abandonDraftSkillArtifact,
  bindAndValidateDraftSkillArtifact,
  confirmMissingSkillArtifactRepair,
  createMissingSkillArtifactRepairTarget,
  createSkillArtifactDownload,
  getSkillReleaseArtifactPrerequisites,
} from "@/lib/services/skill-artifact-service";
import { cleanupOrphanedMedia } from "@/lib/media-cleanup";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  createStoredZip,
  MemoryStorageProvider,
  VALID_SKILL_ZIP,
} from "@/test/skill-artifact-fixture";

const actor = { type: "agent" as const, id: "agent-key:wp-03" };

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

async function createDraftFixture(
  accessPolicy: "public" | "authenticated" = "authenticated",
  bytes: Uint8Array = VALID_SKILL_ZIP,
) {
  const storage = new MemoryStorageProvider();
  const user = await createTestUser({ email: `artifact-${crypto.randomUUID()}@example.com` });
  const skill = await createSkill({
    slug: `artifact-${crypto.randomUUID()}`,
    title: "Artifact fixture",
    summary: "WP-03 integration fixture.",
  }, actor);
  expect(skill.ok).toBe(true);
  if (!skill.ok) throw new Error(skill.message);
  const release = await createSkillRelease({
    skillId: skill.value.id,
    version: "1.0.0",
    compatibility: "Codex",
    license: "MIT",
    changelogMarkdown: "Initial release",
    accessPolicy,
  }, actor);
  expect(release.ok).toBe(true);
  if (!release.ok) throw new Error(release.message);
  const storageKey = `uploads/skill-artifact/${user.id}/${crypto.randomUUID()}.zip`;
  storage.put(storageKey, bytes);
  const [artifact] = await db.insert(media).values({
    storageKey,
    publicUrl: `/api/assets/${crypto.randomUUID()}`,
    filename: "fixture.zip",
    mimeType: "application/zip",
    fileSize: bytes.byteLength,
    context: "skill-artifact",
    uploadedBy: user.id,
    status: "confirmed",
    entityType: "skillRelease",
    entityId: release.value.id,
    confirmedAt: new Date(),
  }).returning();
  return { storage, skill: skill.value, release: release.value, artifact: artifact!, storageKey, bytes };
}

async function bindValidFixture(accessPolicy: "public" | "authenticated" = "authenticated") {
  const fixture = await createDraftFixture(accessPolicy);
  const bound = await bindAndValidateDraftSkillArtifact({
    releaseId: fixture.release.id,
    mediaId: fixture.artifact.id,
    expectedRevision: fixture.release.revision,
  }, fixture.storage);
  expect(bound.ok).toBe(true);
  if (!bound.ok) throw new Error(bound.message);
  return { ...fixture, release: bound.value.release };
}

async function publishFixture(accessPolicy: "public" | "authenticated") {
  const fixture = await bindValidFixture(accessPolicy);
  const published = await publishSkillRelease({
    skillId: fixture.skill.id,
    releaseId: fixture.release.id,
    expectedSkillRevision: fixture.skill.revision,
    expectedReleaseRevision: fixture.release.revision,
  }, actor, fixture.storage);
  expect(published.ok).toBe(true);
  if (!published.ok) throw new Error(published.message);
  return { ...fixture, release: published.value.release };
}

describe("Skill artifact validation and persistence", () => {
  it("binds a valid ZIP and persists server-owned checksum and manifest evidence", async () => {
    const fixture = await bindValidFixture();
    expect(fixture.release).toMatchObject({
      artifactMediaId: fixture.artifact.id,
      artifactValidation: { valid: true, issues: [] },
      artifactManifest: {
        name: "fixture-skill",
        description: "Safe integration fixture",
        paths: ["SKILL.md", "references/example.md"],
      },
    });
    expect(fixture.release.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.release.artifactValidatedAt).toBeInstanceOf(Date);
    await expect(getSkillReleaseArtifactPrerequisites(fixture.release.id, fixture.storage))
      .resolves.toEqual({
        ok: true,
        value: { binding: "verified", storageHead: "verified", checksum: "verified", archive: "verified" },
      });
  });

  it("treats confirmation of the same validated artifact as an idempotent retry", async () => {
    const fixture = await createDraftFixture();
    const first = await bindAndValidateDraftSkillArtifact({
      releaseId: fixture.release.id,
      mediaId: fixture.artifact.id,
      expectedRevision: fixture.release.revision,
    }, fixture.storage);
    expect(first).toMatchObject({ ok: true });

    const retry = await bindAndValidateDraftSkillArtifact({
      releaseId: fixture.release.id,
      mediaId: fixture.artifact.id,
      expectedRevision: fixture.release.revision,
    }, fixture.storage);
    expect(retry).toMatchObject({
      ok: true,
      value: { release: { artifactMediaId: fixture.artifact.id } },
    });
  });

  it("records an unsafe archive as invalid and keeps it out of publication", async () => {
    const unsafe = createStoredZip({
      "SKILL.md": "# Unsafe",
      "../escape.txt": "must not escape",
    });
    const fixture = await createDraftFixture("public", unsafe);
    const bound = await bindAndValidateDraftSkillArtifact({
      releaseId: fixture.release.id,
      mediaId: fixture.artifact.id,
      expectedRevision: fixture.release.revision,
    }, fixture.storage);
    expect(bound).toMatchObject({ ok: false, kind: "validation-failed" });
    const stored = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, fixture.release.id) });
    expect(stored).toMatchObject({
      status: "draft",
      artifactMediaId: fixture.artifact.id,
      artifactManifest: null,
      artifactValidation: { valid: false },
    });
    const published = await publishSkillRelease({
      skillId: fixture.skill.id,
      releaseId: fixture.release.id,
      expectedSkillRevision: fixture.skill.revision,
      expectedReleaseRevision: stored!.revision,
    }, actor, fixture.storage);
    expect(published).toMatchObject({ ok: false, kind: "validation-failed" });
  });

  it("replaces a draft artifact and orphans only the previous draft media", async () => {
    const fixture = await bindValidFixture();
    const replacementBytes = createStoredZip({
      "SKILL.md": "---\nname: replacement\ndescription: Replacement fixture\n---\n\n# Replacement\n",
    });
    const replacementKey = `${fixture.storageKey}.replacement`;
    fixture.storage.put(replacementKey, replacementBytes);
    const [replacement] = await db.insert(media).values({
      storageKey: replacementKey,
      publicUrl: `/api/assets/${crypto.randomUUID()}`,
      filename: "replacement.zip",
      mimeType: "application/zip",
      fileSize: replacementBytes.byteLength,
      context: "skill-artifact",
      uploadedBy: fixture.artifact.uploadedBy,
      status: "confirmed",
      entityType: "skillRelease",
      entityId: fixture.release.id,
      confirmedAt: new Date(),
    }).returning();
    const replaced = await bindAndValidateDraftSkillArtifact({
      releaseId: fixture.release.id,
      mediaId: replacement!.id,
      expectedRevision: fixture.release.revision,
    }, fixture.storage);
    expect(replaced).toMatchObject({
      ok: true,
      value: { release: { artifactMediaId: replacement!.id, artifactManifest: { name: "replacement" } } },
    });
    expect(await db.query.media.findFirst({ where: eq(media.id, fixture.artifact.id) }))
      .toMatchObject({ status: "orphaned", entityType: null, entityId: null });
  });
});

describe("Skill artifact download and recovery", () => {
  it("enforces public/authenticated access and fails closed on byte drift", async () => {
    const authenticated = await publishFixture("authenticated");
    await expect(createSkillArtifactDownload({
      releaseId: authenticated.release.id,
      authenticated: false,
    }, authenticated.storage)).resolves.toMatchObject({ ok: false, kind: "forbidden" });
    await expect(createSkillArtifactDownload({
      releaseId: authenticated.release.id,
      authenticated: true,
    }, authenticated.storage)).resolves.toMatchObject({
      ok: true,
      value: { checksumSha256: authenticated.release.checksumSha256 },
    });

    const publicRelease = await publishFixture("public");
    await expect(createSkillArtifactDownload({
      releaseId: publicRelease.release.id,
      authenticated: false,
    }, publicRelease.storage)).resolves.toMatchObject({ ok: true });
    const changed = Uint8Array.from(publicRelease.bytes);
    changed[0] = changed[0]! ^ 0xff;
    publicRelease.storage.put(publicRelease.storageKey, changed);
    await expect(createSkillArtifactDownload({
      releaseId: publicRelease.release.id,
      authenticated: false,
    }, publicRelease.storage)).resolves.toMatchObject({ ok: false, kind: "validation-failed" });
  });

  it("repairs a missing published object only with identical bytes", async () => {
    const fixture = await publishFixture("public");
    await fixture.storage.delete(fixture.storageKey);
    await expect(createSkillArtifactDownload({
      releaseId: fixture.release.id,
      authenticated: false,
    }, fixture.storage)).resolves.toMatchObject({ ok: false });
    await expect(createMissingSkillArtifactRepairTarget(fixture.release.id, fixture.storage))
      .resolves.toMatchObject({ ok: true, value: { storageKey: fixture.storageKey } });

    fixture.storage.put(fixture.storageKey, fixture.bytes, "text/plain");
    await expect(confirmMissingSkillArtifactRepair(fixture.release.id, fixture.storage))
      .resolves.toMatchObject({ ok: false, kind: "validation-failed" });
    expect(fixture.storage.objects.has(fixture.storageKey)).toBe(false);

    const wrong = Uint8Array.from(fixture.bytes);
    wrong[wrong.length - 1] = wrong[wrong.length - 1]! ^ 0xff;
    fixture.storage.put(fixture.storageKey, wrong);
    await expect(confirmMissingSkillArtifactRepair(fixture.release.id, fixture.storage))
      .resolves.toMatchObject({ ok: false, kind: "validation-failed" });
    expect(fixture.storage.objects.has(fixture.storageKey)).toBe(false);

    fixture.storage.put(fixture.storageKey, fixture.bytes);
    await expect(confirmMissingSkillArtifactRepair(fixture.release.id, fixture.storage))
      .resolves.toMatchObject({ ok: true });
    await expect(createSkillArtifactDownload({
      releaseId: fixture.release.id,
      authenticated: false,
    }, fixture.storage)).resolves.toMatchObject({ ok: true });
  });

  it("keeps a repair upload when storage inspection is temporarily unavailable", async () => {
    const fixture = await publishFixture("public");
    vi.spyOn(fixture.storage, "readObject").mockRejectedValueOnce(
      new StorageProviderError("INVALID_CONFIG", "Temporary storage read failure"),
    );

    await expect(confirmMissingSkillArtifactRepair(fixture.release.id, fixture.storage))
      .resolves.toMatchObject({ ok: false, kind: "prerequisite-unavailable", retryable: true });
    expect(fixture.storage.objects.has(fixture.storageKey)).toBe(true);
  });
});

describe("Skill artifact cleanup", () => {
  it("orphans an abandoned draft artifact but never detaches a published release", async () => {
    const draft = await bindValidFixture();
    const abandoned = await abandonDraftSkillArtifact({
      releaseId: draft.release.id,
      expectedRevision: draft.release.revision,
    });
    expect(abandoned).toMatchObject({ ok: true, value: { artifactMediaId: null } });
    expect(await db.query.media.findFirst({ where: eq(media.id, draft.artifact.id) }))
      .toMatchObject({ status: "orphaned", entityType: null, entityId: null });
    await db.update(media).set({ createdAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(media.id, draft.artifact.id));
    await expect(cleanupOrphanedMedia(draft.storage)).resolves.toMatchObject({ deleted: 1, errors: 0 });
    expect(draft.storage.objects.has(draft.storageKey)).toBe(false);

    const published = await publishFixture("public");
    await expect(abandonDraftSkillArtifact({
      releaseId: published.release.id,
      expectedRevision: published.release.revision,
    })).resolves.toMatchObject({ ok: false, kind: "immutable" });
    expect(await db.query.media.findFirst({ where: eq(media.id, published.artifact.id) }))
      .toMatchObject({ status: "confirmed", entityType: "skillRelease", entityId: published.release.id });
  });
});
