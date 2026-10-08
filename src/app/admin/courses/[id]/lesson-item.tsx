"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { EditLessonForm } from "./edit-lesson-form";
import { deleteLesson } from "../actions";
import { toast } from "sonner";

const LESSON_TYPE_LABELS: Record<string, string> = {
  video: "影片",
  text: "文字",
  pdf: "PDF",
  download: "下載",
};

interface Lesson {
  id: string;
  chapterId: string;
  title: string;
  type: string;
  content: string;
  duration: number | null;
  isPreview: boolean;
  sortOrder: number;
}

interface Props {
  lesson: Lesson;
}

export function LessonItem({ lesson }: Props) {
  const [editing, setEditing] = useState(false);
  const [isDeleting, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("確定要刪除此課堂？")) return;
    startTransition(async () => {
      await deleteLesson(lesson.id);
      toast.success("課堂已刪除");
    });
  }

  return (
    <div className="px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-muted">
            #{lesson.sortOrder}
          </span>
          <span className="text-sm font-medium text-text-primary">
            {lesson.title}
          </span>
          <Badge variant="default">
            {LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}
          </Badge>
          {lesson.isPreview && (
            <Badge variant="info">預覽</Badge>
          )}
          {lesson.duration && (
            <span className="text-xs text-text-muted">
              {Math.floor(lesson.duration / 60)}:{String(lesson.duration % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="text-xs text-text-secondary hover:underline"
          >
            {editing ? "收起" : "編輯"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-xs text-danger hover:underline disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      </div>

      {editing && (
        <EditLessonForm lesson={lesson} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
