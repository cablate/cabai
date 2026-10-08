"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLibraryAction,
  updateLibraryAction,
  type LibraryActionResult,
} from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormErrorSummary } from "@/components/ui/form-feedback";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";

const fieldLabels = {
  slug: "網址代稱",
  title: "標題",
  summary: "摘要",
  bodyMarkdown: "Markdown 內容",
  tags: "標籤",
  featured: "精選",
  source: "Canonical source",
};

interface LibraryEditorValue {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  featured: boolean;
  revision: number;
  status: "draft" | "published";
}

export function LibraryEditorForm({ entry }: { entry?: LibraryEditorValue }) {
  const router = useRouter();
  const action = entry ? updateLibraryAction.bind(null, entry.id) : createLibraryAction;
  const [state, formAction, pending] = useActionState<LibraryActionResult | null, FormData>(action, null);
  const [bodyMarkdown, setBodyMarkdown] = useState(entry?.bodyMarkdown ?? "");

  useEffect(() => {
    if (!state?.success) return;
    if (!entry && state.entryId) router.push(`/admin/library/${state.entryId}`);
    else router.refresh();
  }, [entry, router, state]);

  return (
    <form action={formAction} className="space-y-6">
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} />
      {entry && <input type="hidden" name="expectedRevision" value={state?.revision ?? entry.revision} />}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Input
          id="title"
          name="title"
          label="標題"
          defaultValue={entry?.title}
          required
          error={state?.fieldErrors?.title?.[0]}
        />
        <Input
          id="slug"
          name="slug"
          label="網址代稱"
          helperText={entry?.status === "published"
            ? "文章發佈後網址固定，避免既有連結與搜尋索引失效。"
            : "只使用小寫英文字母、數字與連字號。"}
          defaultValue={entry?.slug}
          readOnly={entry?.status === "published"}
          required
          error={state?.fieldErrors?.slug?.[0]}
        />
      </div>

      <Textarea
        id="summary"
        name="summary"
        label="摘要"
        rows={3}
        defaultValue={entry?.summary}
        required
        error={state?.fieldErrors?.summary?.[0]}
      />
      <Input
        id="tags"
        name="tags"
        label="標籤"
        helperText="以半形逗號分隔。"
        defaultValue={entry?.tags.join(", ")}
        error={state?.fieldErrors?.tags?.[0]}
      />
      <CheckboxField name="featured" label="設為精選內容" defaultChecked={entry?.featured} />

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <Textarea
          id="bodyMarkdown"
          name="bodyMarkdown"
          label="Markdown 內容"
          rows={22}
          value={bodyMarkdown}
          onChange={(event) => setBodyMarkdown(event.target.value)}
          required
          error={state?.fieldErrors?.bodyMarkdown?.[0]}
          className="font-mono text-sm"
        />
        <section className="min-w-0 rounded-xl border border-border-subtle bg-surface-muted p-5" aria-labelledby="library-preview-title">
          <h2 id="library-preview-title" className="mb-4 text-sm font-semibold text-text-primary">內容預覽</h2>
          {bodyMarkdown.trim() ? (
            <Markdown content={bodyMarkdown} demoteTopHeading />
          ) : (
            <p className="text-sm text-text-muted">輸入 Markdown 後會在這裡預覽。</p>
          )}
        </section>
      </div>

      {state?.success && (
        <p role="status" className="text-sm text-success">
          {entry?.status === "published" ? "變更已儲存。" : "草稿已儲存。"}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {entry?.status === "published" ? "儲存變更" : entry ? "儲存草稿" : "建立 Library 草稿"}
        </Button>
      </div>
    </form>
  );
}
