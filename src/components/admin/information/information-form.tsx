"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createInformationAction,
  publishInformationAction,
  updateInformationAction,
  withdrawInformationAction,
  type InformationActionState,
} from "@/app/admin/information/actions";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Action = {
  rel: string;
  operationId: string;
  credential: "none" | "user";
  parameters: Record<string, string | number | boolean>;
};

type Bundle = {
  sourceType: "manual_announcement" | "library_entry" | "skill_release" | "course" | "api_operation";
  sourceId: string;
  title: string;
  summary: string;
  allowedKinds: string[];
  requiresAction?: boolean;
  actionTemplates: Action[];
};

type Draft = {
  id: string;
  revision: number;
  kind: string;
  title: string;
  summary: string;
  whyItMatters: string;
  bodyMarkdown: string;
  tags: string[];
  expiresAt: string;
  actions: Action[];
};

function Feedback({ state }: { state: InformationActionState }) {
  if (!state) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg p-3 text-sm ${
        state.ok ? "bg-success-light text-success" : "bg-danger-light text-danger"
      }`}
    >
      <p>{state.message}</p>
      {state.fieldErrors && (
        <ul className="mt-1 list-disc pl-5">
          {Object.values(state.fieldErrors)
            .flat()
            .map((message, index) => <li key={`${message}:${index}`}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}

function Fields({ bundle, draft }: { bundle: Bundle; draft?: Draft }) {
  const selected = new Set(draft?.actions.map((action) => action.rel) ?? []);

  return (
    <>
      {draft ? (
        <Select
          id="kind-display"
          label="Information 種類"
          value={draft.kind}
          disabled
          helperText="種類由來源決定，建立後不可變更。"
        >
          {bundle.allowedKinds.map((kind) => <option key={kind}>{kind}</option>)}
        </Select>
      ) : (
        <Select
          id="kind"
          name="kind"
          label="Information 種類"
          required
          defaultValue={bundle.allowedKinds[0]}
        >
          {bundle.allowedKinds.map((kind) => <option key={kind}>{kind}</option>)}
        </Select>
      )}
      <Input
        id="title"
        name="title"
        label="標題"
        required
        maxLength={200}
        defaultValue={draft?.title ?? bundle.title}
      />
      <Textarea
        id="summary"
        name="summary"
        label="摘要"
        required
        maxLength={600}
        rows={4}
        defaultValue={draft?.summary ?? bundle.summary}
      />
      <Textarea
        id="whyItMatters"
        name="whyItMatters"
        label="為什麼重要"
        maxLength={1000}
        rows={4}
        defaultValue={draft?.whyItMatters ?? ""}
      />
      <Textarea
        id="bodyMarkdown"
        name="bodyMarkdown"
        label="完整內文（Markdown）"
        maxLength={100000}
        rows={12}
        defaultValue={draft?.bodyMarkdown ?? ""}
        helperText="使用者展開公告後會看到此內容；HTML 不會被當成可執行內容。"
      />
      <Input
        id="tags"
        name="tags"
        label="標籤"
        defaultValue={draft?.tags.join(", ") ?? ""}
        helperText="以半形逗號分隔，最多 20 個。"
      />
      <Input
        id="expiresAt"
        name="expiresAt"
        type="datetime-local"
        label="到期時間"
        defaultValue={draft?.expiresAt ?? ""}
        helperText="留空代表不自動到期。"
      />
      <fieldset className="rounded-xl border border-border-subtle p-4">
        <legend className="px-1 text-sm font-semibold">Canonical Agent actions</legend>
        {bundle.actionTemplates.length === 0 ? (
          <p
            role={bundle.requiresAction === false ? "status" : "alert"}
            className={`text-sm ${
              bundle.requiresAction === false ? "text-text-secondary" : "text-danger"
            }`}
          >
            {bundle.requiresAction === false
              ? "此公告不需要 action。"
              : "目前沒有安全且可用的 action template，草稿無法通過 readiness。"}
          </p>
        ) : (
          <div className="space-y-3">
            {bundle.actionTemplates.map((action) => (
              <div key={action.rel} className="rounded-lg bg-surface-muted p-3">
                <CheckboxField
                  name="actionSelections"
                  value={action.rel}
                  defaultChecked={draft ? selected.has(action.rel) : true}
                  label={`${action.rel} · ${action.operationId}`}
                />
                <p className="mt-1 break-all pl-6 font-mono text-xs text-text-muted">
                  credential: {action.credential} · {JSON.stringify(action.parameters)}
                </p>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}

export function InformationDraftForm({
  bundle,
  draft,
}: {
  bundle: Bundle;
  draft?: Draft;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    draft ? updateInformationAction : createInformationAction,
    null,
  );

  useEffect(() => {
    if (!state?.ok) return;
    if (draft) {
      router.refresh();
    } else if (state.informationId) {
      router.push(`/admin/information/${state.informationId}`);
    }
  }, [draft, router, state]);

  return (
    <form action={formAction} className="space-y-5">
      {draft ? (
        <>
          <input type="hidden" name="informationId" value={draft.id} />
          <input type="hidden" name="expectedRevision" value={draft.revision} />
        </>
      ) : (
        <>
          <input type="hidden" name="sourceType" value={bundle.sourceType} />
          {bundle.sourceId && <input type="hidden" name="sourceId" value={bundle.sourceId} />}
        </>
      )}
      <Feedback state={state} />
      <Fields bundle={bundle} draft={draft} />
      <Button type="submit" loading={pending}>
        {draft ? "儲存草稿" : "建立草稿"}
      </Button>
    </form>
  );
}

export function InformationLifecycleForm({
  kind,
  id,
  revision,
  idempotencyKey,
}: {
  kind: "publish" | "withdraw";
  id: string;
  revision: number;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    kind === "publish" ? publishInformationAction : withdrawInformationAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="informationId" value={id} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Feedback state={state} />
      <CheckboxField
        name="confirmed"
        required
        label={kind === "publish"
          ? "我已確認內容與 readiness，現在發布這筆 Information。"
          : "我已確認要撤回這筆 Information。"}
      />
      <Button
        type="submit"
        variant={kind === "withdraw" ? "danger" : "primary"}
        loading={pending}
      >
        {kind === "publish" ? "發布 Information" : "撤回 Information"}
      </Button>
    </form>
  );
}
