"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createLibraryInformationAction,
  updateLibraryInformationAction,
  type LibraryActionResult,
} from "@/app/admin/library/actions";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fieldLabels = {
  informationTitle: "Information 標題",
  informationSummary: "Information 摘要",
  informationWhyItMatters: "重要性",
  informationTags: "標籤",
  actions: "動作",
  source: "Canonical source",
  sourceVersion: "來源修訂",
};

interface InformationValue {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  tags: string[];
  revision: number;
}

export function InformationForm({
  entryId,
  defaultTitle,
  defaultSummary,
  defaultTags,
  information,
}: {
  entryId: string;
  defaultTitle: string;
  defaultSummary: string;
  defaultTags: string[];
  information?: InformationValue;
}) {
  const router = useRouter();
  const action = information
    ? updateLibraryInformationAction.bind(null, entryId, information.id)
    : createLibraryInformationAction.bind(null, entryId);
  const [state, formAction, pending] = useActionState<LibraryActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="space-y-5">
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} />
      {information && (
        <input
          type="hidden"
          name="expectedInformationRevision"
          value={state?.revision ?? information.revision}
        />
      )}
      <Input
        id="informationTitle"
        name="title"
        label="Information 標題"
        defaultValue={information?.title ?? defaultTitle}
        required
        error={state?.fieldErrors?.informationTitle?.[0]}
      />
      <Textarea
        id="informationSummary"
        name="summary"
        label="Information 摘要"
        rows={3}
        defaultValue={information?.summary ?? defaultSummary}
        required
        error={state?.fieldErrors?.informationSummary?.[0]}
      />
      <Textarea
        id="informationWhyItMatters"
        name="whyItMatters"
        label="為什麼重要"
        rows={3}
        defaultValue={information?.whyItMatters}
        error={state?.fieldErrors?.informationWhyItMatters?.[0]}
      />
      <Input
        id="informationTags"
        name="tags"
        label="標籤"
        defaultValue={(information?.tags ?? defaultTags).join(", ")}
        helperText="系統會以 canonical public Library action 綁定此 Information。"
        error={state?.fieldErrors?.informationTags?.[0]}
      />
      {state?.success && <p role="status" className="text-sm text-success">Information 草稿已儲存。</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {information ? "更新 Information 草稿" : "建立發佈所需 Information"}
        </Button>
      </div>
    </form>
  );
}
