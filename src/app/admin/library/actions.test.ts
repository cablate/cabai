import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  createLibraryEntry: vi.fn(),
  updateLibraryEntry: vi.fn(),
  withdrawLibraryEntry: vi.fn(),
  createInformationDraftFromSource: vi.fn(),
  updateInformationDraft: vi.fn(),
  publishLibraryInformationBundle: vi.fn(),
}));

vi.mock("@/lib/admin-action-guard", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/services/library-service", () => ({
  createLibraryEntry: mocks.createLibraryEntry,
  updateLibraryEntry: mocks.updateLibraryEntry,
  withdrawLibraryEntry: mocks.withdrawLibraryEntry,
}));
vi.mock("@/lib/services/information-service", () => ({
  createInformationDraftFromSource: mocks.createInformationDraftFromSource,
  updateInformationDraft: mocks.updateInformationDraft,
}));
vi.mock("@/lib/services/publication-bundle-service", () => ({
  publishLibraryInformationBundle: mocks.publishLibraryInformationBundle,
}));

import {
  createLibraryAction,
  createLibraryInformationAction,
  publishLibraryAction,
  updateLibraryAction,
  withdrawLibraryAction,
} from "./actions";

function libraryForm(): FormData {
  const formData = new FormData();
  formData.set("slug", "safe-library-entry");
  formData.set("title", "Safe Library Entry");
  formData.set("summary", "A canonical summary");
  formData.set("bodyMarkdown", "## Body");
  formData.set("tags", "security, canonical");
  formData.set("featured", "on");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
});

describe("Admin Library actions", () => {
  it("creates Library content only through the canonical service", async () => {
    mocks.createLibraryEntry.mockResolvedValue({ ok: true, value: { id: "library-1", revision: 1 } });

    const result = await createLibraryAction(null, libraryForm());

    expect(mocks.requireAdminAction).toHaveBeenCalledWith("library:create");
    expect(mocks.createLibraryEntry).toHaveBeenCalledWith({
      slug: "safe-library-entry",
      title: "Safe Library Entry",
      summary: "A canonical summary",
      bodyMarkdown: "## Body",
      tags: ["security", "canonical"],
      featured: true,
    });
    expect(result).toEqual({ success: true, entryId: "library-1", revision: 1 });
  });

  it("passes the optimistic revision and exposes canonical conflict issues", async () => {
    mocks.updateLibraryEntry.mockResolvedValue({
      ok: false,
      kind: "stale-revision",
      message: "Library entry revision is stale.",
      issues: [{ code: "invalid_format", field: "slug", severity: "error", message: "Slug changed." }],
    });
    const formData = libraryForm();
    formData.set("expectedRevision", "4");

    const result = await updateLibraryAction("library-1", null, formData);

    expect(mocks.updateLibraryEntry).toHaveBeenCalledWith("library-1", expect.objectContaining({ expectedRevision: 4 }));
    expect(result).toEqual({
      error: "Library entry revision is stale.（stale-revision）",
      fieldErrors: { slug: ["Slug changed."] },
    });
  });

  it("creates final-step Information with the canonical public action selection", async () => {
    mocks.createInformationDraftFromSource.mockResolvedValue({ ok: true, value: { id: "info-1", revision: 1 } });
    const formData = new FormData();
    formData.set("title", "Published notice");
    formData.set("summary", "Read this entry");
    formData.set("whyItMatters", "It is useful");
    formData.set("tags", "library");

    await createLibraryInformationAction("library-1", null, formData);

    expect(mocks.createInformationDraftFromSource).toHaveBeenCalledWith({
      sourceType: "library_entry",
      sourceId: "library-1",
      author: {
        kind: "library.published",
        title: "Published notice",
        summary: "Read this entry",
        whyItMatters: "It is useful",
        actionSelections: [{ rel: "library-entry" }],
        tags: ["library"],
      },
    });
  });

  it("requires confirmation and publishes only through the bundle coordinator", async () => {
    const unconfirmed = new FormData();
    await expect(publishLibraryAction(unconfirmed)).resolves.toEqual({ error: "發佈前必須明確確認。" });
    expect(mocks.publishLibraryInformationBundle).not.toHaveBeenCalled();

    mocks.publishLibraryInformationBundle.mockResolvedValue({
      ok: true,
      value: { library: { id: "library-1", slug: "safe-library-entry" }, information: { id: "info-1" } },
    });
    const formData = new FormData();
    formData.set("confirmed", "yes");
    formData.set("libraryId", "library-1");
    formData.set("expectedLibraryRevision", "3");
    formData.set("informationId", "info-1");
    formData.set("expectedInformationRevision", "2");
    formData.set("idempotencyKey", "publish-library-1-r3-i2");

    const result = await publishLibraryAction(formData);

    expect(mocks.requireAdminAction).toHaveBeenCalledWith("library:publish", { heavy: true });
    expect(mocks.publishLibraryInformationBundle).toHaveBeenCalledWith({
      libraryId: "library-1",
      expectedLibraryRevision: 3,
      informationId: "info-1",
      expectedInformationRevision: 2,
      actor: { type: "user", id: "admin-1" },
      idempotencyKey: "publish-library-1-r3-i2",
    });
    expect(result.success).toBe(true);
  });

  it("withdraws through the canonical Library operation after confirmation", async () => {
    mocks.withdrawLibraryEntry.mockResolvedValue({
      ok: true,
      value: { id: "library-1", slug: "safe-library-entry", revision: 5 },
    });
    const formData = new FormData();
    formData.set("confirmed", "yes");
    formData.set("libraryId", "library-1");
    formData.set("expectedLibraryRevision", "4");

    await withdrawLibraryAction(formData);

    expect(mocks.requireAdminAction).toHaveBeenCalledWith("library:withdraw", { heavy: true });
    expect(mocks.withdrawLibraryEntry).toHaveBeenCalledWith({ id: "library-1", expectedRevision: 4 });
  });
});
