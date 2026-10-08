"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { toggleLessonComplete } from "./actions";

/**
 * Manual mark-complete button. Clicking it toggles the lesson's completed
 * status. Visible and interactive regardless of auto-mark preference.
 * Shows spinner while saving, then calls router.refresh() so sidebar
 * progress updates instantly.
 */
export function MarkCompleteButton({
  lessonId,
  isCompleted,
  onToggle,
  disabled,
}: {
  lessonId: string;
  isCompleted: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = useCallback(() => {
    if (pending || isCompleted) return;
    setError(null);
    startTransition(async () => {
      const result = await toggleLessonComplete(lessonId, true);
      if (result.error) {
        setError(result.error);
        return;
      }
      onToggle?.();
      router.refresh();
    });
  }, [lessonId, isCompleted, pending, onToggle, router]);

  if (isCompleted) {
    return (
      <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
        <CheckCircle size={18} weight="fill" />
        已完成
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || disabled}
        className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Circle size={18} />
        )}
        {pending ? "標記中…" : "完成這堂"}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
