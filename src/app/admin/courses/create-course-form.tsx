"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createCourse, type CourseActionResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-feedback";

const fieldLabels = { planId: "對應方案", title: "課程標題", description: "描述" };

interface Props {
  plans: Array<{ id: string; name: string }>;
}

export function CreateCourseForm({ plans }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CourseActionResult, FormData>(
    createCourse,
    null,
  );

  useEffect(() => {
    if (state?.courseId) {
      router.push(`/admin/courses/${state.courseId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} className="sm:col-span-3" />
      <Select
        id="planId"
        name="planId"
        label="關聯方案"
        required
        error={state?.fieldErrors?.planId?.[0]}
      >
        <option value="">選擇方案</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Input
        id="title"
        name="title"
        label="課程名稱"
        required
        error={state?.fieldErrors?.title?.[0]}
      />

      <Input
        id="description"
        name="description"
        label="描述（選填）"
      />

      <div className="sm:col-span-3">
        <Button type="submit" loading={pending}>
          建立課程
        </Button>
      </div>
    </form>
  );
}
