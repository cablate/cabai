"use client";

import { useActionState } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createLesson, type LessonActionResult } from "../../../actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LessonContentEditor } from "@/components/admin/lesson-content-editor";
import type { LessonResource } from "@/lib/lesson-content";
import { toast } from "sonner";
import { FormErrorSummary } from "@/components/ui/form-feedback";

const fieldLabels = { chapterId: "所屬章節", title: "課堂標題", type: "類型", content: "內容", duration: "時長" };

interface Props {
  courseId: string;
  chapters: { id: string; title: string }[];
  nextSortOrder: number;
}

export function CreateLessonClient({ courseId, chapters, nextSortOrder }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<LessonActionResult, FormData>(
    createLesson,
    null,
  );
  const [lessonType, setLessonType] = useState("video");
  const [content, setContent] = useState("");
  const [resources, setResources] = useState<LessonResource[]>([]);

  useEffect(() => {
    if (state?.success) {
      toast.success("課堂已新增");
      router.push(`/admin/courses/${courseId}`);
    }
  }, [state, courseId, router]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      <FormErrorSummary feedback={state} fieldLabels={fieldLabels} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Select
          id="chapterId"
          name="chapterId"
          label="所屬章節"
          required
          error={state?.fieldErrors?.chapterId?.[0]}
        >
          <option value="">選擇章節</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.title}
            </option>
          ))}
        </Select>

        <Input
          id="title"
          name="title"
          label="課堂標題"
          required
          error={state?.fieldErrors?.title?.[0]}
        />

        <Select
          id="type"
          name="type"
          label="類型"
          required
          value={lessonType}
          onChange={(e) => {
            setLessonType(e.target.value);
            setContent("");
          }}
          error={state?.fieldErrors?.type?.[0]}
        >
          <option value="video">影片</option>
          <option value="text">文字</option>
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

      {/* Full-width content editor */}
      <LessonContentEditor
        type={lessonType}
        value={content}
        onChange={setContent}
        error={state?.fieldErrors?.content?.[0]}
        resources={resources}
        onResourcesChange={setResources}
      />

      <div className="flex items-center gap-6">
        {lessonType === "video" && (
          <Input
            id="duration"
            name="duration"
            label="時長（秒）"
            type="number"
            className="w-40"
            error={state?.fieldErrors?.duration?.[0]}
          />
        )}

        <CheckboxField name="isPreview" label="免費預覽" containerClassName="pt-4" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          新增課堂
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/admin/courses/${courseId}`)}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
