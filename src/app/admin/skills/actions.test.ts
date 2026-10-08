import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  createSkill: vi.fn(),
  createSkillRelease: vi.fn(),
  getAdminSkillRelease: vi.fn(),
  getSkillReadiness: vi.fn(),
  getSkillReleaseReadiness: vi.fn(),
  updateSkill: vi.fn(),
  updateSkillRelease: vi.fn(),
  buildInformationSourceBundle: vi.fn(),
  createInformationDraftFromSource: vi.fn(),
  publishSkillInformationBundle: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin-action-guard", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/information-sources", () => ({ buildInformationSourceBundle: mocks.buildInformationSourceBundle }));
vi.mock("@/lib/services/information-service", () => ({ createInformationDraftFromSource: mocks.createInformationDraftFromSource }));
vi.mock("@/lib/services/publication-bundle-service", () => ({ publishSkillInformationBundle: mocks.publishSkillInformationBundle }));
vi.mock("@/lib/services/skill-release-service", () => ({
  createSkill: mocks.createSkill,
  createSkillRelease: mocks.createSkillRelease,
  getAdminSkillRelease: mocks.getAdminSkillRelease,
  getSkillReadiness: mocks.getSkillReadiness,
  getSkillReleaseReadiness: mocks.getSkillReleaseReadiness,
  updateSkill: mocks.updateSkill,
  updateSkillRelease: mocks.updateSkillRelease,
}));

import { createReleaseAction, createSkillAction, publishBundleAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
});

describe("Admin Skill actions", () => {
  it("normalizes form values before calling the canonical Skill service", async () => {
    mocks.createSkill.mockResolvedValue({ ok: true, value: { id: "skill-1" } });
    const data = new FormData();
    data.set("slug", "sample-skill");
    data.set("title", " Sample Skill ");
    data.set("summary", " Governed release ");
    data.set("tags", "agent, example");

    await createSkillAction(null, data);

    expect(mocks.createSkill).toHaveBeenCalledWith({
      slug: "sample-skill",
      title: "Sample Skill",
      summary: "Governed release",
      tags: ["agent", "example"],
      bodyMarkdown: "",
      distributionMode: "hosted",
      sourceRepositoryUrl: null,
      sourceRef: null,
    }, { type: "user", id: "admin-1" });
  });

  it("keeps release access policy inside the canonical service", async () => {
    mocks.createSkillRelease.mockResolvedValue({ ok: true, value: { id: "release-1" } });
    const data = new FormData();
    data.set("version", "1.0.0");
    data.set("compatibility", "Codex");
    data.set("license", "MIT");
    data.set("changelogMarkdown", "Initial release");
    data.set("accessPolicy", "authenticated");

    await createReleaseAction("skill-1", null, data);

    expect(mocks.createSkillRelease).toHaveBeenCalledWith(expect.objectContaining({
      skillId: "skill-1",
      accessPolicy: "authenticated",
    }), { type: "user", id: "admin-1" });
  });

  it("requires confirmation and publishes only through the atomic bundle", async () => {
    const data = new FormData();
    data.set("confirmPublish", "yes");
    data.set("expectedSkillRevision", "2");
    data.set("expectedReleaseRevision", "3");
    data.set("expectedInformationRevision", "1");
    data.set("idempotencyKey", "publish-release-1-info-1");
    mocks.publishSkillInformationBundle.mockResolvedValue({ ok: true, value: {} });

    await publishBundleAction("skill-1", "release-1", "info-1", null, data);

    expect(mocks.publishSkillInformationBundle).toHaveBeenCalledWith({
      skillId: "skill-1",
      releaseId: "release-1",
      informationId: "info-1",
      expectedSkillRevision: 2,
      expectedReleaseRevision: 3,
      expectedInformationRevision: 1,
      idempotencyKey: "publish-release-1-info-1",
      actor: { type: "user", id: "admin-1" },
    });
  });
});
