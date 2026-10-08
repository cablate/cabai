"use client";

import { useState, useTransition } from "react";
import { updateLesson } from "../actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LessonContentEditor } from "@/components/admin/lesson-content-editor";
import type { LessonResource } from "@/lib/lesson-content";
import { toast } from "sonner";

interface Lesson {
  id: string;
  chapterId: string;
  title: string;
  type: string;
  content: string;
  duration: number | null;
  isPreview: boolean;
  sortOrder: number;
  resources?: LessonResource[];
}

interface Props {
  lesson: Lesson;
  onClose: () => void;
}

export function EditLessonForm({ lesson, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [lessonType, setLessonType] = useState(lesson.type);
  const [content, setContent] = useState(lesson.content);
  const [resources, setResources] = useState<LessonResource[]>(lesson.resources ?? []);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateLesson(lesson.id, formData);
        toast.success("課堂已更新");
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 border-t border-border-subtle pt-4 mt-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          name="title"
          label="標題"
          required
          defaultValue={lesson.title}
        />

        <Select
          name="type"
          label="類型"
          required
          value={lessonType}
          onChange={(e) => {
            setLessonType(e.target.value);
            // Keep content when switching to preserve data
          }}
        >
          <option value="video">影片</option>
          <option value="text">文字（Markdown）</option>
          <option value="pdf">PDF</option>
          <option value="download">下載</option>
        </Select>

        <Input
          name="sortOrder"
          label="排序"
          type="number"
          defaultValue={lesson.sortOrder}
        />
      </div>

      {/* Type-specific content editor */}
      <LessonContentEditor
        type={lessonType}
        value={content}
        onChange={setContent}
        resources={resources}
        onResourcesChange={setResources}
      />

      <div className="flex items-center gap-4">
        {lessonType === "video" && (
          <Input
            name="duration"
            label="時長（秒）"
            type="number"
            className="w-32"
            defaultValue={lesson.duration ?? ""}
          />
        )}

        <CheckboxField
          name="isPreview"
          label="免費預覽"
          defaultChecked={lesson.isPreview}
          containerClassName="pt-4"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending}>
          儲存變更
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-muted"
        >
          取消
        </button>
      </div>
    </form>
  );
}
