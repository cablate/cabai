"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCourse } from "../actions";

interface CourseDetailsFormProps {
  courseId: string;
  title: string;
  description: string | null;
}

export function CourseDetailsForm({
  courseId,
  title,
  description,
}: CourseDetailsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateCourse(courseId, formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
      className="grid gap-4"
    >
      <Input
        id="course-title"
        name="title"
        label="課程名稱"
        required
        defaultValue={title}
      />
      <label className="grid gap-1.5 text-sm font-medium text-text-primary">
        課程說明
        <textarea
          id="course-description"
          name="description"
          rows={4}
          defaultValue={description ?? ""}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-normal leading-6 text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div>
        <Button type="submit" size="sm" loading={pending}>儲存課程資料</Button>
      </div>
    </form>
  );
}
