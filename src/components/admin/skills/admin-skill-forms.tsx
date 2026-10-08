"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createInformationAction, createReleaseAction, createSkillAction, publishBundleAction,
  updateReleaseAction, updateSkillAction, type SkillActionState,
} from "@/app/admin/skills/actions";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function useResult(action: (state: SkillActionState | null, data: FormData) => Promise<SkillActionState>) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SkillActionState | null, FormData>(action, null);
  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
    else if (state?.success) router.refresh();
  }, [state, router]);
  return [state, formAction, pending] as const;
}

function Feedback({ state }: { state: SkillActionState | null }) {
  return (
    <>
      <FormErrorSummary feedback={state} fieldLabels={{ slug: "Slug", title: "名稱", summary: "摘要", version: "版本", actions: "Action" }} />
      {state?.message && <p role="status" className="text-sm text-success">{state.message}</p>}
    </>
  );
}

export function SkillForm({ skill }: { skill?: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  bodyMarkdown: string;
  distributionMode: "hosted" | "github";
  sourceRepositoryUrl: string | null;
  sourceRef: string | null;
  revision: number;
} }) {
  const action = skill ? updateSkillAction.bind(null, skill.id) : createSkillAction;
  const [state, formAction, pending] = useResult(action);
  return (
    <form action={formAction} className="space-y-5">
      <Feedback state={state} />
      {skill && <input type="hidden" name="expectedRevision" value={state?.revision ?? skill.revision} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Input id="title" name="title" label="名稱" required defaultValue={skill?.title} />
        <Input id="slug" name="slug" label="網址識別（Slug）" required defaultValue={skill?.slug} helperText="使用小寫 kebab-case；發布後會成為公開網址的一部分。" />
      </div>
      <Textarea id="summary" name="summary" label="摘要" required rows={4} defaultValue={skill?.summary} />
      <Input id="tags" name="tags" label="標籤" defaultValue={skill?.tags.join(", ")} helperText="以半形逗號分隔；只填使用者能理解的主題。" />
      <Textarea id="bodyMarkdown" name="bodyMarkdown" label="CabAI 公開介紹（Markdown）" rows={12} defaultValue={skill?.bodyMarkdown} helperText="這是 catalog 介紹，可獨立更新；完整 Skill 內容依下方 distribution 來源取得。" />
      <Select id="distributionMode" name="distributionMode" label="完整內容來源" defaultValue={skill?.distributionMode ?? "hosted"}>
        <option value="hosted">CabAI hosted artifact</option>
        <option value="github">GitHub repository</option>
      </Select>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input id="sourceRepositoryUrl" name="sourceRepositoryUrl" label="GitHub repository URL" defaultValue={skill?.sourceRepositoryUrl ?? ""} placeholder="https://github.com/your-org/example-skill" />
        <Input id="sourceRef" name="sourceRef" label="GitHub 正式版本／Ref" defaultValue={skill?.sourceRef ?? ""} placeholder="v1.0.0" />
      </div>
      <p className="text-xs leading-5 text-text-muted">Commit SHA 與驗證時間由 CabAI 來源驗證流程寫入；更換 repository 或 ref 時會自動清除舊證據。</p>
      <Button type="submit" loading={pending}>{skill ? "儲存 Skill" : "建立 Skill"}</Button>
    </form>
  );
}

export function ReleaseForm({ skillId, release }: {
  skillId: string;
  release?: { id: string; version: string; compatibility: string; contentMarkdown: string; license: string; changelogMarkdown: string; accessPolicy: "public" | "authenticated"; revision: number };
}) {
  const action = release ? updateReleaseAction.bind(null, skillId, release.id) : createReleaseAction.bind(null, skillId);
  const [state, formAction, pending] = useResult(action);
  return (
    <form action={formAction} className="space-y-5">
      <Feedback state={state} />
      {release && <input type="hidden" name="expectedRevision" value={state?.revision ?? release.revision} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Input id="version" name="version" label="版本" required defaultValue={release?.version} placeholder="1.0.0" />
        <Select id="accessPolicy" name="accessPolicy" label="存取政策" defaultValue={release?.accessPolicy ?? "authenticated"}>
          <option value="authenticated">需登入／User Agent token</option>
          <option value="public">公開</option>
        </Select>
      </div>
      <Input id="compatibility" name="compatibility" label="相容性" required defaultValue={release?.compatibility} />
      <Input id="license" name="license" label="授權" required defaultValue={release?.license} />
      <Textarea id="contentMarkdown" name="contentMarkdown" label="Release 補充說明（Markdown）" rows={16} defaultValue={release?.contentMarkdown} helperText="Hosted Skill 可放版本內容；GitHub-backed Skill 的公開介紹請改在 Skill 基本資料維護。" />
      <Textarea id="changelogMarkdown" name="changelogMarkdown" label="本次更新說明（Markdown）" rows={6} defaultValue={release?.changelogMarkdown} helperText="說明本次有什麼變化即可，不必重複所有版本歷史。" />
      <Button type="submit" loading={pending}>{release ? "儲存 Release" : "建立 Release"}</Button>
    </form>
  );
}

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error ?? body?.message ?? `HTTP ${response.status}`;
}

export function ArtifactUpload({ releaseId, expectedRevision }: { releaseId: string; expectedRevision: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setStatus({});
    try {
      const targetResponse = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/zip", fileSize: file.size, context: "skill-artifact" }),
      });
      if (!targetResponse.ok) throw new Error(await errorMessage(targetResponse));
      const target = await targetResponse.json() as { signedUrl: string; storageKey: string };
      const putResponse = await fetch(target.signedUrl, {
        method: "PUT", headers: { "Content-Type": file.type || "application/zip" }, body: file,
      });
      if (!putResponse.ok) throw new Error(`Artifact 傳輸失敗（HTTP ${putResponse.status}）`);
      const confirmResponse = await fetch("/api/upload/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: target.storageKey, entityType: "skillRelease",
          entityId: releaseId, expectedEntityRevision: expectedRevision,
        }),
      });
      if (!confirmResponse.ok) throw new Error(await errorMessage(confirmResponse));
      setStatus({ message: "Skill 檔案已確認；正在重新讀取驗證結果。" });
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Skill 檔案上傳失敗。" });
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="skillArtifact" type="file" accept=".zip,application/zip,application/x-zip-compressed" label="Skill 檔案（ZIP）" helperText="上傳後會驗證封裝內容與完整性。" required disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {status.error && <p role="alert" className="text-sm text-danger">{status.error}</p>}
      {status.message && <p role="status" className="text-sm text-success">{status.message}</p>}
      <Button type="submit" loading={pending} disabled={!file}>上傳並確認</Button>
    </form>
  );
}

export function PublicationPanel(props: {
  skillId: string; releaseId: string; skillRevision: number; releaseRevision: number;
  prerequisitesReady: boolean; information?: { id: string; title: string; summary: string; whyItMatters: string; tags: string[]; revision: number; status: string };
}) {
  const informationAction = createInformationAction.bind(null, props.skillId, props.releaseId);
  const [informationState, informationForm, informationPending] = useResult(informationAction);
  const publishAction = props.information
    ? publishBundleAction.bind(null, props.skillId, props.releaseId, props.information.id)
    : async () => ({ error: "請先建立發布公告。" });
  const [publishState, publishForm, publishPending] = useResult(publishAction);
  if (!props.information && !props.prerequisitesReady) {
    return <p className="text-sm text-text-secondary">請先完成 Skill、Release 與檔案驗證；公告是發布前的最後一步。</p>;
  }
  return (
    <div className="space-y-6">
      {!props.information && (
        <form action={informationForm} className="space-y-4">
          <Feedback state={informationState} />
          <Input id="informationTitle" name="informationTitle" label="公告標題" required />
          <Textarea id="informationSummary" name="informationSummary" label="摘要" required rows={3} />
          <Textarea id="whyItMatters" name="whyItMatters" label="為什麼重要" rows={3} />
          <Input id="informationTags" name="informationTags" label="標籤" />
          <Button type="submit" variant="secondary" loading={informationPending}>建立發布公告</Button>
        </form>
      )}
      {props.information?.status === "draft" && (
        <form action={publishForm} className="space-y-4 rounded-lg border border-border-subtle bg-surface-muted p-4">
          <Feedback state={publishState} />
          <input type="hidden" name="expectedSkillRevision" value={props.skillRevision} />
          <input type="hidden" name="expectedReleaseRevision" value={props.releaseRevision} />
          <input type="hidden" name="expectedInformationRevision" value={props.information.revision} />
          <input type="hidden" name="idempotencyKey" value={`admin-skill-publish:${props.releaseId}:${props.information.revision}`} />
          <label className="flex items-start gap-3 text-sm leading-6 text-text-secondary">
            <input className="mt-1 h-4 w-4" type="checkbox" name="confirmPublish" value="yes" required />
            <span>我確認以單一原子化操作發布 Skill、Release 與公告。</span>
          </label>
          <Button type="submit" loading={publishPending} disabled={!props.prerequisitesReady}>確認並一起發布</Button>
        </form>
      )}
    </div>
  );
}
