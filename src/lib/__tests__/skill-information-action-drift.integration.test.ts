import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const openApiFixture = vi.hoisted(() => ({
  operationId: null as string | null,
}));

vi.mock("@/lib/agent/openapi", () => ({
  buildAgentOpenApi: () => ({
    openapi: "3.0.3",
    info: { title: "Skill action drift fixture", version: "1" },
    paths: openApiFixture.operationId
      ? {
          "/api/agent/user/v1/skills/{id}/releases/{version}": {
            get: {
              operationId: openApiFixture.operationId,
              security: [{ userKey: [] }],
              "x-required-scope": "skill:read",
              parameters: [
                { name: "id", in: "path", required: true },
                { name: "version", in: "path", required: true },
              ],
            },
          },
        }
      : {},
  }),
}));

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentInformationItems } from "@/lib/db/schema";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import {
  publishInformation,
  validateInformationReadiness,
} from "@/lib/services/information-service";
import { createSkill, createSkillRelease } from "@/lib/services/skill-release-service";
import { cleanTestData } from "@/test/helpers";

const actor = { type: "agent" as const, id: "skill-action-drift" };
const brokenActionIssue = {
  code: "broken_action",
  field: "actions",
  severity: "error",
  message: "Matching Skill release operation is not registered in the current OpenAPI document",
} as const;

async function createAuthenticatedRelease() {
  const skill = await createSkill({
    slug: `action-drift-${crypto.randomUUID()}`,
    title: "Action drift Skill",
    summary: "A real database fixture for Skill Information action drift.",
    tags: ["test"],
  }, actor);
  expect(skill.ok).toBe(true);
  if (!skill.ok) throw new Error(skill.message);

  const release = await createSkillRelease({
    skillId: skill.value.id,
    version: "1.0.0",
    compatibility: "Codex >= 1",
    license: "MIT",
    changelogMarkdown: "Initial test release.",
    accessPolicy: "authenticated",
  }, actor);
  expect(release.ok).toBe(true);
  if (!release.ok) throw new Error(release.message);

  return { skill: skill.value, release: release.value };
}

describe("Skill Information action drift", () => {
  beforeEach(async () => {
    openApiFixture.operationId = null;
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("keeps a missing getUserSkillRelease operation out of the source bundle and rejects a hand-authored action", async () => {
    const fixture = await createAuthenticatedRelease();
    const source = await buildInformationSourceBundle("skill_release", fixture.release.id);

    expect(source).toMatchObject({
      ok: true,
      value: {
        actionTemplates: [],
        issues: [brokenActionIssue],
      },
    });

    const [information] = await db.insert(agentInformationItems).values({
      dedupeKey: `skill_release:${fixture.release.id}:${fixture.release.version}:skill.released`,
      sourceType: "skill_release",
      sourceId: fixture.release.id,
      sourceVersion: fixture.release.version,
      kind: "skill.released",
      title: "Hand-authored release notice",
      summary: "This action must not bypass the canonical OpenAPI source bundle.",
      audience: "all_users",
      actions: [{
        rel: "skill-release",
        operationId: "getUserSkillRelease",
        parameters: { id: fixture.skill.slug, version: fixture.release.version },
        credential: "user",
      }],
    }).returning();

    const readiness = await validateInformationReadiness(information!.id, {
      allowBundleSource: { sourceType: "skill_release", sourceId: fixture.release.id },
    });
    expect(readiness).toMatchObject({
      ok: true,
      value: {
        ready: false,
        issues: expect.arrayContaining([
          brokenActionIssue,
          expect.objectContaining({ code: "broken_action", field: "actions.0" }),
        ]),
      },
    });

    const publication = await publishInformation({
      informationId: information!.id,
      expectedRevision: information!.revision,
      actor,
      idempotencyKey: `publish:${information!.id}:missing-operation`,
    });
    expect(publication).toMatchObject({
      ok: false,
      kind: "validation-failed",
      issues: expect.arrayContaining([brokenActionIssue]),
    });
    expect(await db.query.agentInformationItems.findFirst({
      where: eq(agentInformationItems.id, information!.id),
    })).toMatchObject({ status: "draft", revision: 1 });
  });

  it("treats an operationId rename at the same route as broken action drift", async () => {
    openApiFixture.operationId = "getUserSkillReleaseV2";
    const fixture = await createAuthenticatedRelease();

    expect(await buildInformationSourceBundle("skill_release", fixture.release.id)).toMatchObject({
      ok: true,
      value: {
        actionTemplates: [],
        issues: [brokenActionIssue],
      },
    });
  });
});
