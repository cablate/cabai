"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowClockwise,
  ArrowsDownUp,
  CaretDown,
  CaretRight,
  CaretUp,
  DotsSixVertical,
  DotsThree,
  FloppyDisk,
  MagnifyingGlass,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  deleteChapter,
  deleteLesson,
  reorderCourseOutline,
  updateChapter,
} from "../actions";

export interface AuthoringLesson {
  id: string;
  title: string;
  type: string;
  status: string;
  isPreview: boolean;
  duration: number | null;
}

export interface AuthoringChapter {
  id: string;
  title: string;
  lessons: AuthoringLesson[];
}

interface Props {
  courseId: string;
  initialRevision: string;
  initialChapters: AuthoringChapter[];
}

type SaveState = "saved" | "unsaved" | "saving" | "failed" | "conflict";
type LessonStatusFilter = "all" | "draft" | "published";
type Selection =
  | { type: "chapter"; id: string }
  | { type: "lesson"; id: string }
  | null;

const LESSON_TYPE_LABELS: Record<string, string> = {
  video: "影片",
  text: "文字",
  pdf: "PDF",
  download: "下載",
};

const LESSON_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  published: "已發布",
};

function chapterDragId(id: string) {
  return `chapter:${id}`;
}

function lessonDragId(id: string) {
  return `lesson:${id}`;
}

function moveLesson(
  chapters: AuthoringChapter[],
  lessonId: string,
  targetChapterId: string,
  targetIndex: number,
) {
  const sourceChapter = chapters.find((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId));
  const lesson = sourceChapter?.lessons.find((item) => item.id === lessonId);
  if (!sourceChapter || !lesson) return chapters;

  return chapters.map((chapter) => {
    const withoutLesson = chapter.lessons.filter((item) => item.id !== lessonId);
    if (chapter.id !== targetChapterId) return { ...chapter, lessons: withoutLesson };
    const insertionIndex = Math.max(0, Math.min(targetIndex, withoutLesson.length));
    const nextLessons = [...withoutLesson];
    nextLessons.splice(insertionIndex, 0, lesson);
    return { ...chapter, lessons: nextLessons };
  });
}

function matchesLessonFilter(
  chapter: AuthoringChapter,
  lesson: AuthoringLesson,
  query: string,
  statusFilter: LessonStatusFilter,
) {
  if (statusFilter !== "all" && lesson.status !== statusFilter) return false;
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("zh-TW");
  return chapter.title.toLocaleLowerCase("zh-TW").includes(normalized)
    || lesson.title.toLocaleLowerCase("zh-TW").includes(normalized);
}

function SortableLessonRow({
  lesson,
  chapterId,
  selected,
  sortMode,
  disabled,
  onSelect,
}: {
  lesson: AuthoringLesson;
  chapterId: string;
  selected: boolean;
  sortMode: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lessonDragId(lesson.id),
    disabled: disabled || !sortMode,
    transition: { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    data: { chapterId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 border-t border-border-subtle px-3 py-2.5 transition-colors sm:px-4",
        selected ? "bg-accent/8" : "hover:bg-surface-muted/70",
        isDragging && "relative z-10 opacity-25",
      )}
    >
      {sortMode && (
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary active:cursor-grabbing"
          aria-label={`拖曳排序課堂：${lesson.title}`}
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical size={17} weight="bold" />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        aria-pressed={selected}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text-primary">{lesson.title}</span>
          <span className="mt-1 block text-xs text-text-muted">
            {LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}
            {lesson.duration ? ` · ${Math.ceil(lesson.duration / 60)} 分鐘` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Badge variant={lesson.status === "published" ? "success" : "default"}>
            {LESSON_STATUS_LABELS[lesson.status] ?? lesson.status}
          </Badge>
          {lesson.isPreview && <Badge variant="info">免費預覽</Badge>}
        </span>
      </button>
    </div>
  );
}

function SortableChapter({
  chapter,
  visibleLessons,
  expanded,
  selected,
  selectedLessonId,
  sortMode,
  disabled,
  searchActive,
  onSelectChapter,
  onSelectLesson,
}: {
  chapter: AuthoringChapter;
  visibleLessons: AuthoringLesson[];
  expanded: boolean;
  selected: boolean;
  selectedLessonId: string | null;
  sortMode: boolean;
  disabled: boolean;
  searchActive: boolean;
  onSelectChapter: () => void;
  onSelectLesson: (lessonId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapterDragId(chapter.id),
    disabled: disabled || !sortMode,
    transition: { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });

  return (
    <section
      id={`chapter-${chapter.id}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-xl border bg-surface",
        selected ? "border-accent/40 shadow-sm" : "border-border-subtle",
        isDragging && "relative z-10 opacity-25",
      )}
    >
      <div className="flex items-center gap-2 p-2 sm:p-3">
        {sortMode && (
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text-primary active:cursor-grabbing"
            aria-label={`拖曳排序章節：${chapter.title}`}
            {...attributes}
            {...listeners}
          >
            <DotsSixVertical size={18} weight="bold" />
          </button>
        )}
        <button
          type="button"
          onClick={onSelectChapter}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left outline-none hover:bg-surface-muted/70 focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-expanded={expanded}
          aria-controls={`chapter-lessons-${chapter.id}`}
          aria-pressed={selected}
        >
          {expanded ? <CaretDown size={17} className="shrink-0 text-text-muted" /> : <CaretRight size={17} className="shrink-0 text-text-muted" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text-primary">{chapter.title}</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              {searchActive ? `${visibleLessons.length} 筆符合 · 共 ${chapter.lessons.length} 堂` : `${chapter.lessons.length} 堂`}
            </span>
          </span>
        </button>
      </div>

      {expanded && (
        <div id={`chapter-lessons-${chapter.id}`}>
          {visibleLessons.length === 0 ? (
            <p className="border-t border-border-subtle px-5 py-6 text-center text-sm text-text-muted">
              {searchActive ? "此章節沒有符合條件的課堂" : "此章節尚無課堂"}
            </p>
          ) : (
            <SortableContext items={visibleLessons.map((lesson) => lessonDragId(lesson.id))} strategy={verticalListSortingStrategy}>
              {visibleLessons.map((lesson) => (
                <SortableLessonRow
                  key={lesson.id}
                  lesson={lesson}
                  chapterId={chapter.id}
                  selected={selectedLessonId === lesson.id}
                  sortMode={sortMode}
                  disabled={disabled}
                  onSelect={() => onSelectLesson(lesson.id)}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </section>
  );
}

export function CourseOutlineEditor({ courseId, initialRevision, initialChapters }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [chapters, setChapters] = useState(initialChapters);
  const [revision, setRevision] = useState(initialRevision);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(initialChapters[0]?.id ?? null);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>("all");
  const [sortMode, setSortMode] = useState(false);
  const [, startSaveTransition] = useTransition();
  const [isMutationPending, startMutationTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemIds = useMemo(() => chapters.map((chapter) => chapterDragId(chapter.id)), [chapters]);
  const normalizedQuery = query.trim();
  const searchActive = Boolean(normalizedQuery || statusFilter !== "all");
  const filteredChapters = useMemo(
    () => chapters
      .map((chapter) => ({
        chapter,
        lessons: chapter.lessons.filter((lesson) => matchesLessonFilter(chapter, lesson, normalizedQuery, statusFilter)),
      }))
      .filter(({ chapter, lessons }) => {
        if (!searchActive) return true;
        const chapterMatches = normalizedQuery
          && chapter.title.toLocaleLowerCase("zh-TW").includes(normalizedQuery.toLocaleLowerCase("zh-TW"));
        return Boolean(chapterMatches || lessons.length > 0);
      }),
    [chapters, normalizedQuery, searchActive, statusFilter],
  );
  const matchedLessonCount = filteredChapters.reduce((count, item) => count + item.lessons.length, 0);

  const selectedChapter = selection?.type === "chapter"
    ? chapters.find((chapter) => chapter.id === selection.id) ?? null
    : null;
  const selectedLessonContext = selection?.type === "lesson"
    ? chapters
        .map((chapter) => ({
          chapter,
          lesson: chapter.lessons.find((lesson) => lesson.id === selection.id),
        }))
        .find((item) => item.lesson) ?? null
    : null;

  const serverItemActionsDisabled = saveState !== "saved" || isMutationPending;
  const orderActionsDisabled = saveState === "saving" || saveState === "conflict" || isMutationPending;

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (saveState !== "saved") event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  function stage(next: AuthoringChapter[]) {
    setChapters(next);
    setSaveState("unsaved");
    setMessage(null);
    setActionMessage(null);
  }

  function persist() {
    if (saveState !== "unsaved" && saveState !== "failed") return;
    const next = chapters;
    setSaveState("saving");
    setMessage(null);
    startSaveTransition(async () => {
      try {
        const result = await reorderCourseOutline({
          courseId,
          expectedRevision: revision,
          chapters: next.map((chapter) => ({
            id: chapter.id,
            lessons: chapter.lessons.map((lesson) => ({ id: lesson.id })),
          })),
        });
        if (result.success && result.revision) {
          setRevision(result.revision);
          setSaveState("saved");
          return;
        }
        if (result.status === "conflict") {
          setSaveState("conflict");
          setMessage(result.error ?? "課綱已有較新的版本，請重新載入後再調整。");
          return;
        }
        setSaveState("failed");
        setMessage(result.error ?? "課綱儲存失敗，變更仍保留在此頁，可再次嘗試。");
      } catch (error) {
        setSaveState("failed");
        setMessage(error instanceof Error ? error.message : "課綱儲存失敗，變更仍保留在此頁，可再次嘗試。");
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    if (activeId.startsWith("chapter:") && overId.startsWith("chapter:")) {
      const from = chapters.findIndex((chapter) => chapterDragId(chapter.id) === activeId);
      const to = chapters.findIndex((chapter) => chapterDragId(chapter.id) === overId);
      if (from >= 0 && to >= 0) stage(arrayMove(chapters, from, to));
      return;
    }
    if (!activeId.startsWith("lesson:")) return;
    const lessonId = activeId.slice("lesson:".length);
    const targetChapter = overId.startsWith("chapter:")
      ? chapters.find((chapter) => chapterDragId(chapter.id) === overId)
      : chapters.find((chapter) => chapter.lessons.some((lesson) => lessonDragId(lesson.id) === overId));
    if (!targetChapter) return;
    const targetIndex = overId.startsWith("lesson:")
      ? targetChapter.lessons.findIndex((lesson) => lessonDragId(lesson.id) === overId)
      : targetChapter.lessons.length;
    stage(moveLesson(chapters, lessonId, targetChapter.id, targetIndex));
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !activeId.startsWith("lesson:")) return;

    const lessonId = activeId.slice("lesson:".length);
    const sourceChapter = chapters.find((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId));
    const targetChapter = overId.startsWith("chapter:")
      ? chapters.find((chapter) => chapterDragId(chapter.id) === overId)
      : chapters.find((chapter) => chapter.lessons.some((lesson) => lessonDragId(lesson.id) === overId));
    if (!sourceChapter || !targetChapter || sourceChapter.id === targetChapter.id) return;

    const targetIndex = overId.startsWith("lesson:")
      ? targetChapter.lessons.findIndex((lesson) => lessonDragId(lesson.id) === overId)
      : targetChapter.lessons.length;
    stage(moveLesson(chapters, lessonId, targetChapter.id, targetIndex));
  }

  function moveChapter(id: string, direction: -1 | 1) {
    const index = chapters.findIndex((chapter) => chapter.id === id);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < chapters.length) {
      stage(arrayMove(chapters, index, target));
    }
  }

  function moveSelectedLesson(targetChapterId: string, targetIndex: number) {
    if (!selectedLessonContext?.lesson) return;
    stage(moveLesson(chapters, selectedLessonContext.lesson.id, targetChapterId, targetIndex));
    setExpandedChapterId(targetChapterId);
  }

  function selectChapter(chapterId: string) {
    setSelection({ type: "chapter", id: chapterId });
    setExpandedChapterId((current) => current === chapterId ? null : chapterId);
    setActionMessage(null);
  }

  function selectLesson(chapterId: string, lessonId: string) {
    setSelection({ type: "lesson", id: lessonId });
    setExpandedChapterId(chapterId);
    setActionMessage(null);
  }

  function enterSortMode() {
    setQuery("");
    setStatusFilter("all");
    setSortMode(true);
    setActionMessage(null);
  }

  async function requestDeleteChapter(chapter: AuthoringChapter) {
    const accepted = await confirm({
      title: `刪除章節「${chapter.title}」？`,
      description: chapter.lessons.length > 0
        ? `此操作會一併刪除章節中的 ${chapter.lessons.length} 堂課。資料會採軟刪除，但仍請先確認。`
        : "此操作會刪除目前章節。資料會採軟刪除，但仍請先確認。",
      confirmLabel: "刪除章節",
      variant: "danger",
    });
    if (!accepted) return;

    startMutationTransition(async () => {
      await deleteChapter(chapter.id);
      setSelection(null);
      router.refresh();
    });
  }

  async function requestDeleteLesson(lesson: AuthoringLesson) {
    const accepted = await confirm({
      title: `刪除課堂「${lesson.title}」？`,
      description: "此操作會將課堂軟刪除，學員將無法再從課程中開啟它。",
      confirmLabel: "刪除課堂",
      variant: "danger",
    });
    if (!accepted) return;

    startMutationTransition(async () => {
      await deleteLesson(lesson.id);
      setSelection(null);
      router.refresh();
    });
  }

  function renameChapter(chapter: AuthoringChapter, formData: FormData) {
    if (serverItemActionsDisabled) return;
    setActionMessage(null);
    startMutationTransition(async () => {
      const result = await updateChapter(chapter.id, formData);
      if (result?.error) {
        setActionMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  const activeLabel = activeDragId?.startsWith("chapter:")
    ? chapters.find((chapter) => chapterDragId(chapter.id) === activeDragId)?.title
    : chapters.flatMap((chapter) => chapter.lessons).find((lesson) => lessonDragId(lesson.id) === activeDragId)?.title;

  return (
    <section id="outline-workspace" className="scroll-mt-24 space-y-4" aria-labelledby="outline-workspace-title">
      <div className="rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 id="outline-workspace-title" className="text-lg font-semibold text-text-primary">課綱工作區</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              先搜尋或選取章節／課堂，再顯示對應操作；lesson 內容仍在獨立頁面編輯。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveStateLabel saveState={saveState} />
            {saveState === "conflict" ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => router.refresh()}>
                <ArrowClockwise size={15} />重新載入最新課綱
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={persist}
                loading={saveState === "saving"}
                disabled={saveState !== "unsaved" && saveState !== "failed"}
              >
                <FloppyDisk size={15} />
                {saveState === "failed" ? "再次儲存" : "儲存課綱"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant={sortMode ? "primary" : "secondary"}
              disabled={saveState === "saving" || saveState === "conflict"}
              onClick={() => sortMode ? setSortMode(false) : enterSortMode()}
            >
              <ArrowsDownUp size={15} />
              {sortMode ? "結束排序" : "調整順序"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(14rem,1fr)_13rem_auto]">
          <label className="relative">
            <span className="sr-only">搜尋課堂或章節</span>
            <MagnifyingGlass size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              disabled={sortMode}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋課堂或章節"
              className="min-h-10 w-full rounded-lg border border-border-subtle bg-surface pl-10 pr-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface-muted"
            />
          </label>
          <Select
            aria-label="篩選課堂狀態"
            value={statusFilter}
            disabled={sortMode}
            onChange={(event) => setStatusFilter(event.target.value as LessonStatusFilter)}
          >
            <option value="all">全部課堂狀態</option>
            <option value="draft">草稿</option>
            <option value="published">已發布</option>
          </Select>
          <p className="self-center text-xs text-text-muted">
            {searchActive ? `${filteredChapters.length} 章、${matchedLessonCount} 堂符合` : `${chapters.length} 章、${chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)} 堂`}
          </p>
        </div>

        {message && (
          <p role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger">
            {message}
          </p>
        )}
        {sortMode && (
          <p className="mt-4 rounded-lg bg-info-light px-4 py-3 text-sm text-info">
            排序模式已開啟。搜尋與狀態篩選暫時停用；拖曳或使用右側操作後，仍需按「儲存課綱」才會寫入。
          </p>
        )}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={(event: DragStartEvent) => setActiveDragId(String(event.active.id))}
          onDragOver={handleDragOver}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={(event) => {
            setActiveDragId(null);
            handleDragEnd(event);
          }}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="min-w-0 space-y-3" aria-busy={saveState === "saving" || isMutationPending}>
              {filteredChapters.map(({ chapter, lessons: visibleLessons }) => {
                const forcedOpen = searchActive;
                return (
                  <SortableChapter
                    key={chapter.id}
                    chapter={chapter}
                    visibleLessons={visibleLessons}
                    expanded={forcedOpen || expandedChapterId === chapter.id}
                    selected={selection?.type === "chapter" && selection.id === chapter.id}
                    selectedLessonId={selection?.type === "lesson" ? selection.id : null}
                    sortMode={sortMode}
                    disabled={saveState === "saving" || isMutationPending}
                    searchActive={searchActive}
                    onSelectChapter={() => selectChapter(chapter.id)}
                    onSelectLesson={(lessonId) => selectLesson(chapter.id, lessonId)}
                  />
                );
              })}
              {filteredChapters.length === 0 && (
                <div className="rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center">
                  <p className="text-sm font-medium text-text-primary">找不到符合條件的課堂</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("all");
                    }}
                    className="mt-3 text-sm font-medium text-accent hover:text-success"
                  >
                    清除搜尋與篩選
                  </button>
                </div>
              )}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {activeLabel ? (
              <div className="max-w-sm rounded-xl border border-accent/30 bg-surface px-4 py-3 text-sm font-medium text-text-primary shadow-elevated">
                {activeLabel}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <aside className="rounded-2xl border border-border-subtle bg-surface p-4 xl:sticky xl:top-24" aria-label="目前選取項目">
          {!selection && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-text-primary">尚未選取章節或課堂</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">從左側課綱選取一項後，才會顯示編輯、移動與刪除操作。</p>
            </div>
          )}

          {selectedChapter && (
            <ChapterSelectionPanel
              chapter={selectedChapter}
              chapters={chapters}
              mutationDisabled={serverItemActionsDisabled}
              orderDisabled={orderActionsDisabled}
              pending={isMutationPending}
              actionMessage={actionMessage}
              onRename={(formData) => renameChapter(selectedChapter, formData)}
              onMove={(direction) => moveChapter(selectedChapter.id, direction)}
              onDelete={() => void requestDeleteChapter(selectedChapter)}
            />
          )}

          {selectedLessonContext?.lesson && (
            <LessonSelectionPanel
              courseId={courseId}
              chapter={selectedLessonContext.chapter}
              lesson={selectedLessonContext.lesson}
              chapters={chapters}
              mutationDisabled={serverItemActionsDisabled}
              orderDisabled={orderActionsDisabled}
              onMove={moveSelectedLesson}
              onDelete={() => void requestDeleteLesson(selectedLessonContext.lesson!)}
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function SaveStateLabel({ saveState }: { saveState: SaveState }) {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-full bg-surface-muted px-3 text-xs" aria-live="polite">
      <ArrowsDownUp size={15} aria-hidden="true" />
      <span
        className={cn(
          saveState === "saved" && "text-success",
          saveState === "unsaved" && "text-warning",
          saveState === "saving" && "text-text-muted",
          (saveState === "failed" || saveState === "conflict") && "text-danger",
        )}
      >
        {saveState === "saved" && "課綱已儲存"}
        {saveState === "unsaved" && "有未儲存的課綱變更"}
        {saveState === "saving" && "正在儲存課綱…"}
        {saveState === "failed" && "課綱儲存失敗"}
        {saveState === "conflict" && "課綱已有較新的版本"}
      </span>
    </div>
  );
}

function ChapterSelectionPanel({
  chapter,
  chapters,
  mutationDisabled,
  orderDisabled,
  pending,
  actionMessage,
  onRename,
  onMove,
  onDelete,
}: {
  chapter: AuthoringChapter;
  chapters: AuthoringChapter[];
  mutationDisabled: boolean;
  orderDisabled: boolean;
  pending: boolean;
  actionMessage: string | null;
  onRename: (formData: FormData) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge>章節</Badge>
          <h3 className="mt-2 font-semibold text-text-primary">{chapter.title}</h3>
          <p className="mt-1 text-sm text-text-muted">{chapter.lessons.length} 堂課</p>
        </div>
        <ItemOverflowMenu
          label={`章節「${chapter.title}」操作`}
          disabled={mutationDisabled}
          onDelete={onDelete}
          deleteLabel="刪除章節"
        />
      </div>

      {mutationDisabled && (
        <p className="mt-4 rounded-lg bg-warning-light px-3 py-2 text-xs leading-5 text-warning">
          請先完成或重新載入課綱變更，再修改章節資料。
        </p>
      )}

      <form
        action={onRename}
        className="mt-5 space-y-2"
      >
        <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
          章節名稱
          <input
            name="title"
            defaultValue={chapter.title}
            disabled={mutationDisabled}
            className="min-h-10 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </label>
        <input type="hidden" name="sortOrder" value={chapterIndex} />
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={mutationDisabled}>
          更新章節名稱
        </Button>
      </form>

      <div className="mt-5 border-t border-border-subtle pt-4">
        <p className="text-xs font-medium text-text-secondary">章節位置</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={orderDisabled || chapterIndex === 0} onClick={() => onMove(-1)}>
            <CaretUp size={14} />上移
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={orderDisabled || chapterIndex === chapters.length - 1} onClick={() => onMove(1)}>
            <CaretDown size={14} />下移
          </Button>
        </div>
      </div>

      {actionMessage && <p role="alert" className="mt-4 text-sm text-danger">{actionMessage}</p>}
    </div>
  );
}

function LessonSelectionPanel({
  courseId,
  chapter,
  lesson,
  chapters,
  mutationDisabled,
  orderDisabled,
  onMove,
  onDelete,
}: {
  courseId: string;
  chapter: AuthoringChapter;
  lesson: AuthoringLesson;
  chapters: AuthoringChapter[];
  mutationDisabled: boolean;
  orderDisabled: boolean;
  onMove: (targetChapterId: string, targetIndex: number) => void;
  onDelete: () => void;
}) {
  const lessonIndex = chapter.lessons.findIndex((item) => item.id === lesson.id);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={lesson.status === "published" ? "success" : "default"}>
            {LESSON_STATUS_LABELS[lesson.status] ?? lesson.status}
          </Badge>
          <h3 className="mt-2 font-semibold text-text-primary">{lesson.title}</h3>
          <p className="mt-1 text-sm text-text-muted">目前章節：{chapter.title}</p>
        </div>
        <ItemOverflowMenu
          label={`課堂「${lesson.title}」操作`}
          disabled={mutationDisabled}
          onDelete={onDelete}
          deleteLabel="刪除課堂"
        />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-surface-muted p-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">內容類型</dt>
          <dd className="mt-1 font-medium text-text-primary">{LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">免費預覽</dt>
          <dd className="mt-1 font-medium text-text-primary">{lesson.isPreview ? "是" : "否"}</dd>
        </div>
      </dl>

      {mutationDisabled ? (
        <span className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-surface-muted px-4 text-sm font-medium text-text-muted">
          <PencilSimple size={16} weight="bold" />請先處理課綱變更
        </span>
      ) : (
        <Link prefetch={false} href={`/admin/courses/${courseId}/lessons/${lesson.id}/edit`} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-surface-inverse px-4 text-sm font-medium text-text-inverted transition hover:bg-surface-inverse-hover active:scale-[0.99]">
          <PencilSimple size={16} weight="bold" />編輯課堂內容
        </Link>
      )}

      <div className="mt-5 border-t border-border-subtle pt-4">
        <p className="text-xs font-medium text-text-secondary">課堂位置</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={orderDisabled || lessonIndex === 0} onClick={() => onMove(chapter.id, lessonIndex - 1)}>
            <CaretUp size={14} />上移
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={orderDisabled || lessonIndex === chapter.lessons.length - 1} onClick={() => onMove(chapter.id, lessonIndex + 1)}>
            <CaretDown size={14} />下移
          </Button>
        </div>
        {chapters.length > 1 && (
          <label className="mt-3 grid gap-1.5 text-xs font-medium text-text-secondary">
            移至其他章節
            <Select
              aria-label={`移動課堂「${lesson.title}」到章節`}
              value={chapter.id}
              disabled={orderDisabled}
              onChange={(event) => {
                const targetChapter = chapters.find((item) => item.id === event.target.value);
                if (targetChapter) onMove(targetChapter.id, targetChapter.lessons.length);
              }}
            >
              {chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </label>
        )}
      </div>
    </div>
  );
}

function ItemOverflowMenu({
  label,
  disabled,
  onDelete,
  deleteLabel,
}: {
  label: string;
  disabled: boolean;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        aria-label={label}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted outline-none hover:bg-surface-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/30 disabled:pointer-events-none disabled:opacity-50"
      >
        <DotsThree size={20} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 p-1.5">
        <DropdownMenuItem
          className="rounded-md text-danger hover:text-danger focus:text-danger"
          onSelect={onDelete}
        >
          <Trash size={16} weight="bold" />
          {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
