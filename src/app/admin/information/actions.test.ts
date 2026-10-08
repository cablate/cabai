import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  buildInformationSourceBundle: vi.fn(),
  createInformationDraftFromSource: vi.fn(),
  getInformation: vi.fn(),
  publishInformation: vi.fn(),
  updateInformationDraft: vi.fn(),
  withdrawInformation: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin-action-guard", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/information-sources", () => ({ buildInformationSourceBundle: mocks.buildInformationSourceBundle }));
vi.mock("@/lib/services/information-service", () => ({
  createInformationDraftFromSource: mocks.createInformationDraftFromSource,
  getInformation: mocks.getInformation,
  publishInformation: mocks.publishInformation,
  updateInformationDraft: mocks.updateInformationDraft,
  withdrawInformation: mocks.withdrawInformation,
}));

import { createInformationAction, publishInformationAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.buildInformationSourceBundle.mockResolvedValue({ ok: true, value: { requiresBundlePublish: false } });
});

function lifecycleForm() {
  const data = new FormData();
  data.set("informationId", "info-1");
  data.set("expectedRevision", "2");
  data.set("idempotencyKey", "publish-info-1-r2");
  data.set("confirmed", "on");
  return data;
}

describe("Admin Information actions", () => {
  it("uses the canonical source bundle and forwards locked-field tampering for strict rejection", async () => {
    mocks.createInformationDraftFromSource.mockResolvedValue({
      ok: false,
      kind: "validation-failed",
      message: "Information author input is invalid",
    });
    const data = new FormData();
    data.set("sourceType", "api_operation");
    data.set("sourceId", "getPublicLibraryEntry");
    data.set("kind", "api.added");
    data.set("title", "New API");
    data.set("summary", "Use the canonical endpoint");
    data.set("audience", "all_users");

    await createInformationAction(null, data);

    expect(mocks.buildInformationSourceBundle).toHaveBeenCalledWith("api_operation", "getPublicLibraryEntry");
    expect(mocks.createInformationDraftFromSource).toHaveBeenCalledWith(expect.objectContaining({
      author: expect.objectContaining({ audience: "all_users" }),
    }));
  });

  it("blocks standalone publication for a bundle-owned source", async () => {
    mocks.getInformation.mockResolvedValue({
      ok: true,
      value: { sourceType: "skill_release", sourceId: "release-1" },
    });
    mocks.buildInformationSourceBundle.mockResolvedValue({
      ok: true,
      value: { requiresBundlePublish: true },
    });

    const result = await publishInformationAction(null, lifecycleForm());

    expect(result).toEqual({ ok: false, message: "請回到所屬 Library、Skill 或 Course 頁面完成原子發布。" });
    expect(mocks.publishInformation).not.toHaveBeenCalled();
  });

  it("publishes standalone Information through the canonical lifecycle service", async () => {
    mocks.getInformation.mockResolvedValue({
      ok: true,
      value: { sourceType: "api_operation", sourceId: "getPublicLibraryEntry" },
    });
    mocks.publishInformation.mockResolvedValue({ ok: true, value: { id: "info-1" } });

    await publishInformationAction(null, lifecycleForm());

    expect(mocks.publishInformation).toHaveBeenCalledWith({
      informationId: "info-1",
      expectedRevision: 2,
      idempotencyKey: "publish-info-1-r2",
      actor: { type: "user", id: "admin-1" },
    });
  });
});
