"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  CheckCircle,
  Circle,
} from "@phosphor-icons/react";
import { LESSON_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LearnerOutlineChapter } from "@/lib/learner-course-view-model";

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function LearnerChapter({
  chapter,
  courseId,
  resumeLessonId,
  defaultOpen,
}: {
  chapter: LearnerOutlineChapter;
  courseId: string;
  resumeLessonId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const completedCount = chapter.lessons.filter(
    (lesson) => lesson.completed,
  ).length;
  const isCompleted = completedCount === chapter.lessons.length;
  const panelId = `learner-chapter-${chapter.id}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-[background-color,transform] hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.998] sm:px-5"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <CaretDown
          size={16}
          weight="bold"
          className={cn(
            "shrink-0 text-text-muted transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary">
            {chapter.title}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            {completedCount}/{chapter.lessons.length} 堂完成
          </span>
        </span>
        {isCompleted && (
          <CheckCircle
            size={20}
            weight="fill"
            className="shrink-0 text-success"
            aria-label="本章已完成"
          />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="border-t border-border-subtle px-2 py-2 sm:px-3"
        >
          {chapter.lessons.map((lesson, index) => {
            const isResumeLesson =
              lesson.id === resumeLessonId && !lesson.completed;

            return (
              <Link prefetch={false}
                key={lesson.id}
                href={`/courses/${courseId}/lessons/${lesson.id}`}
                aria-current={isResumeLesson ? "step" : undefined}
                className={cn(
                  "group flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.995]",
                  isResumeLesson
                    ? "border-accent/30 bg-accent-light"
                    : "border-transparent hover:border-border-subtle hover:bg-surface-muted",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                  {lesson.completed ? (
                    <CheckCircle
                      size={18}
                      weight="fill"
                      className="text-success"
                    />
                  ) : (
                    <Circle
                      size={18}
                      className={
                        isResumeLesson ? "text-accent" : "text-text-muted"
                      }
                    />
                  )}
                  <span className="sr-only">第 {index + 1} 堂</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary group-hover:text-accent">
                    {lesson.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                    {isResumeLesson && (
                      <span className="font-medium text-accent">
                        接著學這堂
                      </span>
                    )}
                    {lesson.isPreview && (
                      <span className="text-blue-600">可預覽</span>
                    )}
                    {lesson.duration != null && lesson.duration > 0 && (
                      <span>{formatDuration(lesson.duration)}</span>
                    )}
                    {!lesson.completed && lesson.progress > 0 && (
                      <span>已看 {lesson.progress}%</span>
                    )}
                  </span>
                </span>

                <span className="hidden shrink-0 rounded-md bg-surface-muted px-2 py-1 text-xs text-text-muted sm:inline">
                  {LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LearnerCourseOutline({
  courseId,
  chapters,
  resumeLessonId,
  defaultOpenChapterId,
}: {
  courseId: string;
  chapters: LearnerOutlineChapter[];
  resumeLessonId: string | null;
  defaultOpenChapterId: string | null;
}) {
  return (
    <div className="space-y-3">
      {chapters.map((chapter) => (
        <LearnerChapter
          key={chapter.id}
          chapter={chapter}
          courseId={courseId}
          resumeLessonId={resumeLessonId}
          defaultOpen={chapter.id === defaultOpenChapterId}
        />
      ))}
    </div>
  );
}
