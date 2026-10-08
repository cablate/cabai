"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toggleLessonComplete } from "./actions";

/**
 * Auto-marks the lesson as complete when the page loads — but only if the
 * user's preference allows auto-marking.
 * Fires once on mount — does not unmark on unmount.
 * Calls router.refresh() so the sidebar/course progress updates instantly.
 */
export function AutoMarkProgress({
  lessonId,
  alreadyCompleted,
  autoMarkEnabled,
}: {
  lessonId: string;
  alreadyCompleted: boolean;
  autoMarkEnabled: boolean;
}) {
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (alreadyCompleted || !autoMarkEnabled || fired.current) return;
    fired.current = true;

    toggleLessonComplete(lessonId, true)
      .then(() => router.refresh())
      .catch(() => {});
  }, [lessonId, alreadyCompleted, autoMarkEnabled, router]);

  return null;
}
