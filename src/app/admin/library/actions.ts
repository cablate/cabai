"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import {
  createLibraryEntry,
  updateLibraryEntry,
  withdrawLibraryEntry,
} from "@/lib/services/library-service";
import {
  createInformationDraftFromSource,
  updateInformationDraft,
} from "@/lib/services/information-service";
import { publishLibraryInformationBundle } from "@/lib/services/publication-bundle-service";
import type { DomainFailure } from "@/lib/services/library-skill-information-domain";

export interface LibraryActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  entryId?: string;
  revision?: number;
}

const editableFields = new Set([
  "slug",
  "title",
  "summary",
  "bodyMarkdown",
  "tags",
  "featured",
  "kind",
  "whyItMatters",
  "expiresAt",
  "source",
  "sourceVersion",
  "actions",
]);

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function revision(formData: FormData, name: string): number | null {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function tags(formData: FormData): string[] {
  return text(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function failureResult(failure: DomainFailure): LibraryActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of failure.issues ?? []) {
    const field = editableFields.has(issue.field) ? issue.field : "source";
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return {
    error: `${failure.message}（${failure.kind}）`,
    ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
  };
}

function informationFailureResult(failure: DomainFailure): LibraryActionResult {
  const result = failureResult(failure);
  const fieldMap: Record<string, string> = {
    title: "informationTitle",
    summary: "informationSummary",
    whyItMatters: "informationWhyItMatters",
    tags: "informationTags",
  };
  if (!result.fieldErrors) return result;
  return {
    ...result,
    fieldErrors: Object.fromEntries(
      Object.entries(result.fieldErrors).map(([field, messages]) => [fieldMap[field] ?? field, messages]),
    ),
  };
}

function libraryInput(formData: FormData) {
  return {
    slug: text(formData, "slug"),
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    bodyMarkdown: String(formData.get("bodyMarkdown") ?? ""),
    tags: tags(formData),
    featured: formData.get("featured") === "on",
  };
}

function informationAuthor(formData: FormData) {
  return {
    kind: "library.published" as const,
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    whyItMatters: text(formData, "whyItMatters"),
    actionSelections: [{ rel: "library-entry" }],
    tags: tags(formData),
  };
}

function revalidateLibrary(entryId?: string) {
  revalidatePath("/admin/library");
  if (entryId) revalidatePath(`/admin/library/${entryId}`);
}

export async function createLibraryAction(
  _previous: LibraryActionResult | null,
  formData: FormData,
): Promise<LibraryActionResult> {
  await requireAdminAction("library:create");
  const result = await createLibraryEntry(libraryInput(formData));
  if (!result.ok) return failureResult(result);
  revalidateLibrary(result.value.id);
  return { success: true, entryId: result.value.id, revision: result.value.revision };
}

export async function updateLibraryAction(
  entryId: string,
  _previous: LibraryActionResult | null,
  formData: FormData,
): Promise<LibraryActionResult> {
  await requireAdminAction("library:update");
  const expectedRevision = revision(formData, "expectedRevision");
  if (!expectedRevision) return { error: "修訂版本無效，請重新整理後再試。" };

  const result = await updateLibraryEntry(entryId, {
    expectedRevision,
    ...libraryInput(formData),
  });
  if (!result.ok) return failureResult(result);
  revalidateLibrary(entryId);
  return { success: true, entryId, revision: result.value.revision };
}

export async function createLibraryInformationAction(
  entryId: string,
  _previous: LibraryActionResult | null,
  formData: FormData,
): Promise<LibraryActionResult> {
  await requireAdminAction("library:publish");
  const result = await createInformationDraftFromSource({
    sourceType: "library_entry",
    sourceId: entryId,
    author: informationAuthor(formData),
  });
  if (!result.ok) return informationFailureResult(result);
  revalidateLibrary(entryId);
  return { success: true, entryId, revision: result.value.revision };
}

export async function updateLibraryInformationAction(
  entryId: string,
  informationId: string,
  _previous: LibraryActionResult | null,
  formData: FormData,
): Promise<LibraryActionResult> {
  await requireAdminAction("library:publish");
  const expectedRevision = revision(formData, "expectedInformationRevision");
  if (!expectedRevision) return { error: "Information 修訂版本無效，請重新整理後再試。" };

  const author = informationAuthor(formData);
  const result = await updateInformationDraft(informationId, {
    expectedRevision,
    title: author.title,
    summary: author.summary,
    whyItMatters: author.whyItMatters,
    actionSelections: author.actionSelections,
    tags: author.tags,
  });
  if (!result.ok) return informationFailureResult(result);
  revalidateLibrary(entryId);
  return { success: true, entryId, revision: result.value.revision };
}

export async function publishLibraryAction(formData: FormData): Promise<LibraryActionResult> {
  if (formData.get("confirmed") !== "yes") {
    return { error: "發佈前必須明確確認。" };
  }

  const expectedLibraryRevision = revision(formData, "expectedLibraryRevision");
  const expectedInformationRevision = revision(formData, "expectedInformationRevision");
  const libraryId = text(formData, "libraryId");
  const informationId = text(formData, "informationId");
  const idempotencyKey = text(formData, "idempotencyKey");
  if (!libraryId || !informationId || !idempotencyKey || !expectedLibraryRevision || !expectedInformationRevision) {
    return { error: "發佈資料不完整，請重新整理後再試。" };
  }

  const session = await requireAdminAction("library:publish", { heavy: true });
  const result = await publishLibraryInformationBundle({
    libraryId,
    expectedLibraryRevision,
    informationId,
    expectedInformationRevision,
    actor: { type: "user", id: session.user.id },
    idempotencyKey,
  });
  if (!result.ok) return failureResult(result);
  revalidateLibrary(libraryId);
  revalidatePath(`/library/${result.value.library.slug}`);
  return { success: true, entryId: libraryId };
}

export async function withdrawLibraryAction(formData: FormData): Promise<LibraryActionResult> {
  if (formData.get("confirmed") !== "yes") {
    return { error: "下架前必須明確確認。" };
  }
  const id = text(formData, "libraryId");
  const expectedRevision = revision(formData, "expectedLibraryRevision");
  if (!id || !expectedRevision) return { error: "下架資料不完整，請重新整理後再試。" };

  await requireAdminAction("library:withdraw", { heavy: true });
  const result = await withdrawLibraryEntry({ id, expectedRevision });
  if (!result.ok) return failureResult(result);
  revalidateLibrary(id);
  revalidatePath(`/library/${result.value.slug}`);
  return { success: true, entryId: id };
}
