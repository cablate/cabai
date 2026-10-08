"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPlanContent, type PlanContentActionResult } from "./actions";

interface PlanContentFormProps {
  planId: string;
  nextSortOrder: number;
}

export function PlanContentForm({ planId, nextSortOrder }: PlanContentFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<PlanContentActionResult, FormData>(
    createPlanContent,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      toast.success("交付內容已新增");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="planId" value={planId} />

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.7fr_0.4fr]">
        <Input
          name="title"
          label="內容標題"
          placeholder="例如：課前準備清單"
          required
          error={state?.fieldErrors?.title?.[0]}
        />
        <Select
          name="type"
          label="交付類型"
          required
          error={state?.fieldErrors?.type?.[0]}
        >
          <option value="text">文字</option>
          <option value="video">影片</option>
          <option value="pdf">PDF</option>
          <option value="download">下載</option>
        </Select>
        <Input
          name="sortOrder"
          label="排序"
          type="number"
          defaultValue={nextSortOrder}
        />
      </div>

      <Textarea
        name="content"
        label="內容或連結"
        placeholder="可填入文字、影片嵌入網址、PDF 連結或下載檔案 URL"
        required
        rows={4}
        error={state?.fieldErrors?.content?.[0]}
      />

      {state?.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}

      <Button type="submit" loading={pending}>
        新增交付內容
      </Button>
    </form>
  );
}
