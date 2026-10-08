import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentInformationEvents,
  agentInformationItems,
  media,
  skillReleases,
  skills,
} from "@/lib/db/schema";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { createInformationDraftFromSource } from "@/lib/services/information-service";
import { publishSkillInformationBundle } from "@/lib/services/publication-bundle-service";
import {
  createSkill,
  createSkillRelease,
  getPublicSkillReleaseProjection,
} from "@/lib/services/skill-release-service";
import {
  bindAndValidateDraftSkillArtifact,
  createSkillArtifactDownload,
} from "@/lib/services/skill-artifact-service";
import { cleanTestData, createTestUser } from "@/test/helpers";
import { MemoryStorageProvider, VALID_SKILL_ZIP } from "@/test/skill-artifact-fixture";
import { generateUserToken } from "@/lib/user-auth";
import { GET as getUnread } from "@/app/api/agent/user/v1/information/route";
import { POST as acknowledge } from "@/app/api/agent/user/v1/information/ack/route";
import { GET as getUserRelease } from "@/app/api/agent/user/v1/skills/[id]/releases/[version]/route";

const actor = { type: "agent" as const, id: "agent-key:wp-06" };

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

async function checksumSha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createReadyVerticalFixture() {
  const user = await createTestUser({ email: `vertical-${crypto.randomUUID()}@example.com` });
  const tokenA = await generateUserToken(user.id);
  const tokenB = await generateUserToken(user.id);
  const storage = new MemoryStorageProvider();
  const skill = await createSkill({
    slug: `vertical-skill-${crypto.randomUUID()}`,
    title: "Neutral reference Skill",
    summary: "A neutral owner-authored vertical-flow fixture.",
    tags: ["reference"],
  }, actor);
  expect(skill.ok).toBe(true);
  if (!skill.ok) throw new Error(skill.message);

  const release = await createSkillRelease({
    skillId: skill.value.id,
    version: "1.0.0",
    compatibility: "Codex >= 1",
    license: "MIT",
    changelogMarkdown: "Initial neutral reference release.",
    accessPolicy: "authenticated",
  }, actor);
  expect(release.ok).toBe(true);
  if (!release.ok) throw new Error(release.message);

  const storageKey = `skills/${release.value.id}.zip`;
  storage.put(storageKey, VALID_SKILL_ZIP);
  const [artifact] = await db.insert(media).values({
    storageKey,
    publicUrl: "/controlled-skill-download",
    filename: "neutral-reference-skill.zip",
    mimeType: "application/zip",
    fileSize: VALID_SKILL_ZIP.byteLength,
    context: "skill-artifact",
    uploadedBy: user.id,
    status: "confirmed",
    entityType: "skillRelease",
    entityId: release.value.id,
    confirmedAt: new Date(),
  }).returning({ id: media.id });
  const bound = await bindAndValidateDraftSkillArtifact({
    releaseId: release.value.id,
    mediaId: artifact!.id,
    expectedRevision: release.value.revision,
  }, storage);
  expect(bound.ok).toBe(true);
  if (!bound.ok) throw new Error(bound.message);

  const source = await buildInformationSourceBundle("skill_release", release.value.id);
  expect(source).toMatchObject({
    ok: true,
    value: {
      actionTemplates: [{
        operationId: "getUserSkillRelease",
        credential: "user",
        parameters: { id: skill.value.slug, version: release.value.version },
      }],
      issues: [],
    },
  });
  const information = await createInformationDraftFromSource({
    sourceType: "skill_release",
    sourceId: release.value.id,
    author: {
      kind: "skill.released",
      title: "Neutral reference Skill released",
      summary: "Use the governed Skill operation to inspect this release.",
      whyItMatters: "The user can retrieve a verified owner-authored Skill artifact.",
      actionSelections: [{ rel: "skill-release" }],
      tags: ["reference"],
    },
  });
  expect(information.ok).toBe(true);
  if (!information.ok) throw new Error(information.message);

  return {
    user,
    tokenA,
    tokenB,
    storage,
    storageKey,
    skill: skill.value,
    release: bound.value.release,
    information: information.value,
  };
}

async function publishFixture(fixture: Awaited<ReturnType<typeof createReadyVerticalFixture>>, key: string) {
  return publishSkillInformationBundle({
    skillId: fixture.skill.id,
    releaseId: fixture.release.id,
    expectedSkillRevision: fixture.skill.revision,
    expectedReleaseRevision: fixture.release.revision,
    informationId: fixture.information.id,
    expectedInformationRevision: fixture.information.revision,
    actor,
    idempotencyKey: key,
  }, fixture.storage);
}

describe("WP-06 Skill → Information → User Agent vertical evidence", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("publishes atomically, resolves through real User Token routes, verifies checksum, and ACKs across tokens", async () => {
    const fixture = await createReadyVerticalFixture();
    const before = await getUnread(new Request("https://example.test/api/agent/user/v1/information", {
      headers: { authorization: `Bearer ${fixture.tokenA.fullToken}` },
    }));
    expect(before.status).toBe(200);
    expect(await json(before)).toMatchObject({ data: { items: [] } });

    const published = await publishFixture(fixture, "wp-06-happy");
    expect(published).toMatchObject({
      ok: true,
      value: {
        skill: { status: "published" },
        release: { status: "published" },
        information: { status: "published" },
      },
    });

    const unread = await getUnread(new Request("https://example.test/api/agent/user/v1/information?state=unread", {
      headers: { authorization: `Bearer ${fixture.tokenA.fullToken}` },
    }));
    expect(unread.status).toBe(200);
    const unreadBody = await json(unread);
    expect(unreadBody).toMatchObject({
      data: {
        items: [{
          id: fixture.information.id,
          actions: [{ operationId: "getUserSkillRelease" }],
        }],
      },
    });

    const releaseResponse = await getUserRelease(
      new Request("https://example.test/api/agent/user/v1/skills/release", {
        headers: { authorization: `Bearer ${fixture.tokenA.fullToken}` },
      }),
      { params: Promise.resolve({ id: fixture.skill.slug, version: fixture.release.version }) },
    );
    expect(releaseResponse.status).toBe(200);
    expect(await json(releaseResponse)).toMatchObject({
      data: { id: fixture.release.id, downloadableForViewer: true },
    });

    const download = await createSkillArtifactDownload({
      releaseId: fixture.release.id,
      authenticated: true,
    }, fixture.storage);
    expect(download).toMatchObject({
      ok: true,
      value: { checksumSha256: await checksumSha256(VALID_SKILL_ZIP) },
    });

    const ack = await acknowledge(new Request("https://example.test/api/agent/user/v1/information/ack", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.tokenB.fullToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ informationIds: [fixture.information.id] }),
    }));
    expect(ack.status).toBe(200);
    expect(await json(ack)).toMatchObject({ data: { acknowledged: [fixture.information.id] } });

    const after = await getUnread(new Request("https://example.test/api/agent/user/v1/information", {
      headers: { authorization: `Bearer ${fixture.tokenA.fullToken}` },
    }));
    expect(await json(after)).toMatchObject({ data: { items: [] } });
  });

  it("rolls back stale publication and replays one committed lifecycle event", async () => {
    const fixture = await createReadyVerticalFixture();
    const stale = await publishSkillInformationBundle({
      skillId: fixture.skill.id,
      releaseId: fixture.release.id,
      expectedSkillRevision: fixture.skill.revision,
      expectedReleaseRevision: fixture.release.revision,
      informationId: fixture.information.id,
      expectedInformationRevision: 99,
      actor,
      idempotencyKey: "wp-06-stale",
    }, fixture.storage);
    expect(stale).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.skills.findFirst({ where: eq(skills.id, fixture.skill.id) }))
      .toMatchObject({ status: "draft" });
    expect(await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, fixture.release.id) }))
      .toMatchObject({ status: "draft" });
    expect(await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, fixture.information.id) }))
      .toMatchObject({ status: "draft" });

    const inputKey = "wp-06-replay";
    expect(await publishFixture(fixture, inputKey)).toMatchObject({ ok: true });
    expect(await publishFixture(fixture, inputKey)).toMatchObject({
      ok: true,
      value: { release: { status: "published" }, information: { revision: 2 } },
    });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(1);
  });

  it("fails a published download closed when the artifact object disappears", async () => {
    const fixture = await createReadyVerticalFixture();
    expect(await publishFixture(fixture, "wp-06-missing-object")).toMatchObject({ ok: true });
    await fixture.storage.delete(fixture.storageKey);

    expect(await createSkillArtifactDownload({
      releaseId: fixture.release.id,
      authenticated: true,
    }, fixture.storage)).toMatchObject({ ok: false, kind: "validation-failed" });
    expect(await getPublicSkillReleaseProjection(
      fixture.skill.slug,
      fixture.release.version,
      { authenticated: true },
    )).toMatchObject({ ok: true, value: { id: fixture.release.id } });
  });
});
