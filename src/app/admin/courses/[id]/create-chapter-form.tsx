"use client";

import { useActionState } from "react";
import { useEffect, useRef } from "react";
import { createChapter, type ChapterActionResult } from "../actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FormErrorSummary } from "@/components/ui/form-feedback";

interface Props {
  courseId: string;
  nextSortOrder: number;
}

export function CreateChapterForm({ courseId, nextSortOrder }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ChapterActionResult, FormData>(
    createChapter,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      toast.success("章節已新增");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sortOrder" value={nextSortOrder} />

      <FormErrorSummary feedback={state} fieldLabels={{ title: "章節名稱" }} className="sm:col-span-2" />

      <Input
        id="title"
        name="title"
        label="章節名稱"
        required
        placeholder="第一章：基礎觀念"
        error={state?.fieldErrors?.title?.[0]}
        className="flex-1"
      />

      <Button type="submit" loading={pending}>
        新增
      </Button>
    </form>
  );
}
