"use server";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { buildInformationSourceBundle, type InformationSourceType } from "@/lib/information-sources";
import { createInformationDraftFromSource, getInformation, publishInformation, updateInformationDraft, withdrawInformation } from "@/lib/services/information-service";
import type { DomainFailure, InformationKind } from "@/lib/services/library-skill-information-domain";

export type InformationActionState = { ok: boolean; message: string; informationId?: string; fieldErrors?: Record<string, string[]> } | null;
const sourceTypes = new Set<InformationSourceType>(["manual_announcement", "library_entry", "skill_release", "course", "api_operation"]);
const lockedCreate = ["audience", "actions", "status", "sourceVersion", "dedupeKey", "revision"];
const lockedPatch = ["kind", "audience", "actions", "status", "sourceType", "sourceId", "sourceVersion", "dedupeKey", "revision"];
const val = (d: FormData, k: string) => typeof d.get(k) === "string" ? String(d.get(k)).trim() : "";
const bad = (field: string, message: string): NonNullable<InformationActionState> => ({ ok: false, message, fieldErrors: { [field]: [message] } });
function failed(r: DomainFailure): NonNullable<InformationActionState> {
  const fieldErrors: Record<string, string[]> = {};
  for (const i of r.issues ?? []) {
    const field = i.field.startsWith("actions") ? "actionSelections" : i.field;
    fieldErrors[field] = [...(fieldErrors[field] ?? []), i.message];
  }
  return { ok: false, message: r.message, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) };
}
const rev = (d: FormData) => { const n = Number(val(d, "expectedRevision")); return Number.isInteger(n) && n > 0 ? n : null; };
const selections = (d: FormData) => d.getAll("actionSelections").filter((x): x is string => typeof x === "string").map((rel) => ({ rel }));
const tags = (d: FormData) => val(d, "tags").split(",").map((x) => x.trim()).filter(Boolean);
function tampering(target: Record<string, unknown>, d: FormData, fields: string[]) { for (const field of fields) if (d.has(field)) target[field] = d.get(field); }
function refresh(id: string) { revalidatePath("/admin/information"); revalidatePath("/admin/information/coverage"); revalidatePath(`/admin/information/${id}`); }

export async function createInformationAction(_: InformationActionState, d: FormData): Promise<InformationActionState> {
  await requireAdminAction("information:create");
  const rawType = val(d, "sourceType"), sourceId = val(d, "sourceId");
  if (!sourceTypes.has(rawType as InformationSourceType)) return bad("sourceType", "不支援此來源類型。");
  if (!sourceId && rawType !== "manual_announcement") return bad("sourceId", "來源 ID 為必填。");
  const sourceType = rawType as InformationSourceType;
  const kind = val(d, "kind") as InformationKind;
  const source = sourceType === "course"
    ? await buildInformationSourceBundle(sourceType, sourceId, { kind })
    : await buildInformationSourceBundle(sourceType, sourceId);
  if (!source.ok) return failed(source);
  const author: Record<string, unknown> = { kind: val(d, "kind"), title: val(d, "title"), summary: val(d, "summary"), whyItMatters: val(d, "whyItMatters"), bodyMarkdown: val(d, "bodyMarkdown"), actionSelections: selections(d), tags: tags(d) };
  if (val(d, "expiresAt")) author.expiresAt = val(d, "expiresAt");
  tampering(author, d, lockedCreate);
  const result = await createInformationDraftFromSource({ sourceType, sourceId: sourceId || undefined, author });
  if (!result.ok) return failed(result);
  refresh(result.value.id);
  return { ok: true, message: "Information 草稿已建立。", informationId: result.value.id };
}

export async function updateInformationAction(_: InformationActionState, d: FormData): Promise<InformationActionState> {
  await requireAdminAction("information:update");
  const id = val(d, "informationId"), expectedRevision = rev(d);
  if (!id) return bad("informationId", "Information ID 為必填。");
  if (!expectedRevision) return bad("expectedRevision", "需要有效的 Information revision。");
  const patch: Record<string, unknown> = { title: val(d, "title"), summary: val(d, "summary"), whyItMatters: val(d, "whyItMatters"), bodyMarkdown: val(d, "bodyMarkdown"), actionSelections: selections(d), tags: tags(d), expiresAt: val(d, "expiresAt") || null, expectedRevision };
  tampering(patch, d, lockedPatch);
  const result = await updateInformationDraft(id, patch);
  if (!result.ok) return failed(result);
  refresh(id);
  return { ok: true, message: "Information 草稿已儲存。", informationId: id };
}

async function life(d: FormData, name: string) {
  const session = await requireAdminAction(name, { heavy: true });
  const informationId = val(d, "informationId"), expectedRevision = rev(d), idempotencyKey = val(d, "idempotencyKey");
  if (!informationId || !expectedRevision || !idempotencyKey || val(d, "confirmed") !== "on" || !session?.user?.id) return null;
  return { informationId, expectedRevision, idempotencyKey, actor: { type: "user" as const, id: session.user.id } };
}
export async function publishInformationAction(_: InformationActionState, d: FormData): Promise<InformationActionState> {
  const input = await life(d, "information:publish");
  if (!input) return bad("confirmed", "需要有效的 revision、操作者身分、idempotency key 與明確確認。");
  const current = await getInformation(input.informationId);
  if (!current.ok) return failed(current);
  const source = current.value.sourceType === "course"
    ? await buildInformationSourceBundle(current.value.sourceType, current.value.sourceId, { kind: current.value.kind as InformationKind })
    : await buildInformationSourceBundle(current.value.sourceType, current.value.sourceId);
  if (!source.ok) return failed(source);
  if (source.value.requiresBundlePublish) return { ok: false, message: "請回到所屬 Library、Skill 或 Course 頁面完成原子發布。" };
  const result = await publishInformation(input);
  if (!result.ok) return failed(result);
  refresh(input.informationId);
  return { ok: true, message: "Information 已發布。", informationId: input.informationId };
}
export async function withdrawInformationAction(_: InformationActionState, d: FormData): Promise<InformationActionState> {
  const input = await life(d, "information:withdraw");
  if (!input) return bad("confirmed", "需要有效的 revision、操作者身分、idempotency key 與明確確認。");
  const result = await withdrawInformation(input);
  if (!result.ok) return failed(result);
  refresh(input.informationId);
  return { ok: true, message: "Information 已撤回。", informationId: input.informationId };
}
