import type { Chapter, Lesson } from "@/lib/db/schema";
import { LessonItem } from "./lesson-item";
import { deleteChapter } from "../actions";

interface Props {
  chapter: Chapter;
  lessons: Lesson[];
  allChapters: Chapter[];
}

export function ChapterSection({ chapter, lessons }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <h3 className="text-sm font-medium text-text-secondary">
          {chapter.title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {lessons.length} 堂
          </span>
          <form
            action={async () => {
              "use server";
              await deleteChapter(chapter.id);
            }}
          >
            <button
              type="submit"
              className="text-xs text-text-muted hover:text-danger"
            >
              刪除
            </button>
          </form>
        </div>
      </div>
      <div className="divide-y divide-border-subtle">
        {lessons.map((lesson) => (
          <LessonItem key={lesson.id} lesson={lesson} />
        ))}
        {lessons.length === 0 && (
          <div className="px-6 py-4 text-center text-sm text-text-muted">
            此章節尚無課堂，請在下方新增。
          </div>
        )}
      </div>
    </div>
  );
}
