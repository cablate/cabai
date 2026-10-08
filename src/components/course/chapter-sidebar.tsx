"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Circle,
  List,
  X,
} from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LESSON_TYPE_LABELS } from "@/lib/constants";
import { LearningProgress } from "@/components/learning/learning-progress";

export interface SidebarLesson {
  id: string;
  title: string;
  type: string;
  duration: number | null;
  isPreview: boolean;
  completed: boolean;
}

export interface SidebarChapter {
  id: string;
  title: string;
  lessons: SidebarLesson[];
}

interface ChapterSidebarProps {
  courseId: string;
  courseTitle: string;
  chapters: SidebarChapter[];
  currentLessonId: string;
  completedCount: number;
  totalCount: number;
  backHref: string;
  backLabel: string;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function ChapterGroup({
  chapter,
  courseId,
  currentLessonId,
  defaultOpen,
  onNavigate,
}: {
  chapter: SidebarChapter;
  courseId: string;
  currentLessonId: string;
  defaultOpen: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const currentLinkRef = useRef<HTMLAnchorElement | null>(null);
  const completed = chapter.lessons.filter((l) => l.completed).length;
  const panelId = `chapter-panel-${chapter.id}`;

  useEffect(() => {
    if (!defaultOpen) return;
    currentLinkRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [defaultOpen, currentLessonId]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left transition-[background-color,transform] hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.995]"
      >
        <CaretDown
          size={14}
          weight="bold"
          className={cn(
            "shrink-0 text-text-muted transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span className="flex-1 truncate text-sm font-medium text-text-primary">
          {chapter.title}
        </span>
        <span className="text-xs text-text-muted">
          {completed}/{chapter.lessons.length}
        </span>
      </button>

      {open && (
        <div id={panelId} className="pb-1">
          {chapter.lessons.map((lesson) => {
            const isCurrent = lesson.id === currentLessonId;
            return (
              <Link prefetch={false}
                key={lesson.id}
                ref={isCurrent ? currentLinkRef : undefined}
                href={`/courses/${courseId}/lessons/${lesson.id}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-start gap-2.5 border-l-2 px-4 py-2.5 pl-9 text-sm transition-[background-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                  isCurrent
                    ? "border-amber-soft bg-amber-soft/10 text-text-primary"
                    : "border-transparent text-text-secondary hover:bg-surface-muted",
                )}
              >
                {lesson.completed ? (
                  <CheckCircle
                    size={16}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                ) : (
                  <Circle
                    size={16}
                    className={cn(
                      "mt-0.5 shrink-0",
                      isCurrent ? "text-amber-soft" : "text-text-muted",
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate",
                      isCurrent && "font-medium",
                    )}
                  >
                    {lesson.title}
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                    <span>
                      {LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}
                    </span>
                    {lesson.duration != null && lesson.duration > 0 && (
                      <span>{formatDuration(lesson.duration)}</span>
                    )}
                    {lesson.isPreview && (
                      <span className="text-blue-500">預覽</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChapterSidebar({
  courseId,
  courseTitle,
  chapters,
  currentLessonId,
  completedCount,
  totalCount,
  backHref,
  backLabel,
}: ChapterSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentChapterId = chapters.find((ch) =>
    ch.lessons.some((l) => l.id === currentLessonId),
  )?.id;

  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function renderSidebarContent(onNavigate?: () => void) {
    return (
      <>
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="flex items-center justify-between">
            <Link prefetch={false}
              href={`/courses/${courseId}`}
              className="truncate rounded-sm text-sm font-medium text-text-primary transition-colors hover:text-amber-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={onNavigate}
            >
              {courseTitle}
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                className="hidden shrink-0 rounded p-1 text-text-muted transition-[background-color,color,transform] hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.94] lg:flex"
                  aria-label="進入專注閱讀"
                >
                  <CaretLeft size={14} weight="bold" />
                </button>
              </TooltipTrigger>
              <TooltipContent>專注閱讀</TooltipContent>
            </Tooltip>
          </div>
          <LearningProgress completed={completedCount} total={totalCount} compact className="mt-2" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {chapters.map((chapter) => (
            <ChapterGroup
              key={`${chapter.id}:${currentLessonId}`}
              chapter={chapter}
              courseId={courseId}
              currentLessonId={currentLessonId}
              defaultOpen={chapter.id === currentChapterId}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div className="border-t border-border-subtle px-4 py-3">
          <Link prefetch={false}
            href={backHref}
            className="rounded-sm text-xs text-text-muted transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={onNavigate}
          >
            &larr; 返回{backLabel}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {collapsed ? (
        <aside className="sticky top-[var(--site-header-height)] hidden h-[calc(100dvh-var(--site-header-height))] lg:flex lg:w-12 lg:flex-col lg:items-center lg:border-r lg:border-border-subtle lg:bg-surface lg:pt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="rounded p-2 text-text-muted transition-[background-color,color,transform] hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.94]"
                aria-label="顯示章節目錄"
              >
                <CaretRight size={16} weight="bold" />
              </button>
            </TooltipTrigger>
            <TooltipContent>顯示章節目錄</TooltipContent>
          </Tooltip>
        </aside>
      ) : (
        <aside className="sticky top-[var(--site-header-height)] hidden h-[calc(100dvh-var(--site-header-height))] lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:border-r lg:border-border-subtle lg:bg-surface">
          {renderSidebarContent()}
        </aside>
      )}

      <div className="fixed bottom-4 right-4 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 active:scale-[0.94]"
          aria-label="開啟章節目錄"
        >
          <List size={22} weight="bold" />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="章節目錄"
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            onClick={() => setMobileOpen(false)}
            aria-label="關閉章節目錄"
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[75vh] flex-col rounded-t-2xl bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="text-sm font-medium text-text-primary">
                章節目錄
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-1 text-text-muted transition-[background-color,color,transform] hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 active:scale-[0.94]"
                aria-label="關閉目錄"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {renderSidebarContent(() => setMobileOpen(false))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
