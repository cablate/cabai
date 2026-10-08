"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { createInformationDraftFromSource } from "@/lib/services/information-service";
import type { DomainFailure } from "@/lib/services/library-skill-information-domain";
import { publishSkillInformationBundle } from "@/lib/services/publication-bundle-service";
import {
  createSkill, createSkillRelease, getAdminSkillRelease, getSkillReadiness,
  getSkillReleaseReadiness, updateSkill, updateSkillRelease,
} from "@/lib/services/skill-release-service";

export type SkillActionState = {
  success?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  redirectTo?: string;
  revision?: number;
};

function failure(result: DomainFailure): SkillActionState {
  const fieldErrors = result.issues?.reduce<Record<string, string[]>>((all, issue) => {
    all[issue.field] = [...(all[issue.field] ?? []), issue.message];
    return all;
  }, {});
  return {
    error: result.kind === "stale-revision" ? "內容已變更，請重新整理後再試。" : result.message,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

const tags = (value: FormDataEntryValue | null) =>
  String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const nullableText = (value: FormDataEntryValue | null) => text(value) || null;
const sourceFields = (data: FormData) => {
  const distributionMode = text(data.get("distributionMode")) === "github" ? "github" as const : "hosted" as const;
  if (distributionMode === "hosted") {
    return {
      distributionMode,
      sourceRepositoryUrl: null,
      sourceRef: null,
    };
  }
  return {
    distributionMode,
    sourceRepositoryUrl: nullableText(data.get("sourceRepositoryUrl")),
    sourceRef: nullableText(data.get("sourceRef")),
  };
};
const revision = (value: FormDataEntryValue | null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const actor = (id: string) => ({ type: "user" as const, id });
function refresh(skillId: string, releaseId?: string) {
  revalidatePath("/admin/skills");
  revalidatePath(`/admin/skills/${skillId}`);
  if (releaseId) revalidatePath(`/admin/skills/${skillId}/releases/${releaseId}`);
}

export async function createSkillAction(_: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  const session = await requireAdminAction("skill:create");
  const result = await createSkill({
    slug: text(data.get("slug")), title: text(data.get("title")), summary: text(data.get("summary")), tags: tags(data.get("tags")),
    bodyMarkdown: String(data.get("bodyMarkdown") ?? ""), ...sourceFields(data),
  }, actor(session.user.id));
  if (!result.ok) return failure(result);
  refresh(result.value.id);
  return { success: true, redirectTo: `/admin/skills/${result.value.id}` };
}

export async function updateSkillAction(skillId: string, _: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  const session = await requireAdminAction("skill:update");
  const expectedRevision = revision(data.get("expectedRevision"));
  if (!expectedRevision) return { error: "Skill revision 無效。" };
  const result = await updateSkill(skillId, {
    expectedRevision, slug: text(data.get("slug")), title: text(data.get("title")),
    summary: text(data.get("summary")), tags: tags(data.get("tags")),
    bodyMarkdown: String(data.get("bodyMarkdown") ?? ""), ...sourceFields(data),
  }, actor(session.user.id));
  if (!result.ok) return failure(result);
  refresh(skillId);
  return { success: true, message: "Skill 已儲存。", revision: result.value.revision };
}

export async function createReleaseAction(skillId: string, _: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  const session = await requireAdminAction("skill-release:create");
  const result = await createSkillRelease({
    skillId, version: text(data.get("version")), compatibility: text(data.get("compatibility")),
    license: text(data.get("license")), contentMarkdown: String(data.get("contentMarkdown") ?? ""),
    changelogMarkdown: String(data.get("changelogMarkdown") ?? ""),
    accessPolicy: text(data.get("accessPolicy")) as "public" | "authenticated",
  }, actor(session.user.id));
  if (!result.ok) return failure(result);
  refresh(skillId, result.value.id);
  return { success: true, redirectTo: `/admin/skills/${skillId}/releases/${result.value.id}` };
}

export async function updateReleaseAction(skillId: string, releaseId: string, _: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  const session = await requireAdminAction("skill-release:update");
  const expectedRevision = revision(data.get("expectedRevision"));
  if (!expectedRevision) return { error: "Release revision 無效。" };
  const result = await updateSkillRelease(releaseId, {
    expectedRevision, version: text(data.get("version")), compatibility: text(data.get("compatibility")),
    license: text(data.get("license")), contentMarkdown: String(data.get("contentMarkdown") ?? ""),
    changelogMarkdown: String(data.get("changelogMarkdown") ?? ""),
    accessPolicy: text(data.get("accessPolicy")) as "public" | "authenticated",
  }, actor(session.user.id));
  if (!result.ok) return failure(result);
  refresh(skillId, releaseId);
  return { success: true, message: "Release 已儲存。", revision: result.value.revision };
}

export async function createInformationAction(skillId: string, releaseId: string, _: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  await requireAdminAction("skill-information:create");
  const release = await getAdminSkillRelease(releaseId);
  if (!release.ok) return failure(release);
  const [skillReady, releaseReady] = await Promise.all([
    getSkillReadiness(release.value.skillId), getSkillReleaseReadiness(releaseId),
  ]);
  if (!skillReady.ok) return failure(skillReady);
  if (!releaseReady.ok) return failure(releaseReady);
  if (!skillReady.value.ready || !releaseReady.value.ready) return { error: "請先完成 Skill、Release 與 artifact readiness。" };
  const source = await buildInformationSourceBundle("skill_release", releaseId);
  if (!source.ok) return failure(source);
  if (source.value.issues.length || !source.value.actionTemplates.length) {
    return { error: "Canonical Information action 不可用，已停止建立。" };
  }
  const result = await createInformationDraftFromSource({
    sourceType: "skill_release", sourceId: releaseId,
    author: {
      kind: "skill.released", title: text(data.get("informationTitle")), summary: text(data.get("informationSummary")),
      whyItMatters: text(data.get("whyItMatters")), tags: tags(data.get("informationTags")),
      actionSelections: source.value.actionTemplates.map(({ rel }) => ({ rel })),
    },
  });
  if (!result.ok) return failure(result);
  refresh(skillId, releaseId);
  return { success: true, message: "Information 草稿已建立。" };
}

export async function publishBundleAction(skillId: string, releaseId: string, informationId: string, _: SkillActionState | null, data: FormData): Promise<SkillActionState> {
  const session = await requireAdminAction("skill-release:publish", { heavy: true });
  if (data.get("confirmPublish") !== "yes") return { error: "請先確認 atomic publish。" };
  const expectedSkillRevision = revision(data.get("expectedSkillRevision"));
  const expectedReleaseRevision = revision(data.get("expectedReleaseRevision"));
  const expectedInformationRevision = revision(data.get("expectedInformationRevision"));
  const idempotencyKey = String(data.get("idempotencyKey") ?? "");
  if (!expectedSkillRevision || !expectedReleaseRevision || !expectedInformationRevision || !idempotencyKey) {
    return { error: "發布 revision 無效，請重新整理。" };
  }
  const result = await publishSkillInformationBundle({
    skillId, releaseId, informationId, expectedSkillRevision, expectedReleaseRevision,
    expectedInformationRevision, idempotencyKey, actor: actor(session.user.id),
  });
  if (!result.ok) return failure(result);
  refresh(skillId, releaseId);
  return { success: true, message: "Skill、Release 與 Information 已原子發布。" };
}
