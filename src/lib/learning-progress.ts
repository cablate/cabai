export interface OrderedLessonProgressInput {
  id: string;
  chapterSortOrder: number;
  lessonSortOrder: number;
}

export interface LessonProgressInput {
  lessonId: string;
  completed: boolean;
  progress: number;
  lastAccessedAt: Date | null;
}

export interface CourseLearningState {
  orderedLessonIds: string[];
  completedLessonCount: number;
  progressPercent: number;
  resumeLessonId: string | null;
  isCompleted: boolean;
}

export function resolveCourseLearningState(
  lessons: OrderedLessonProgressInput[],
  progressRows: LessonProgressInput[],
): CourseLearningState {
  const ordered = [...lessons].sort(
    (left, right) =>
      left.chapterSortOrder - right.chapterSortOrder ||
      left.lessonSortOrder - right.lessonSortOrder ||
      left.id.localeCompare(right.id),
  );
  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));
  const incomplete = ordered.filter((lesson) => !progressByLesson.get(lesson.id)?.completed);
  const completedLessonCount = ordered.length - incomplete.length;
  const recentIncomplete = incomplete
    .map((lesson) => ({ lesson, progress: progressByLesson.get(lesson.id) }))
    .filter((entry) => entry.progress?.lastAccessedAt)
    .sort((left, right) =>
      right.progress!.lastAccessedAt!.getTime() - left.progress!.lastAccessedAt!.getTime(),
    )[0];

  return {
    orderedLessonIds: ordered.map((lesson) => lesson.id),
    completedLessonCount,
    progressPercent: ordered.length > 0 ? Math.round((completedLessonCount / ordered.length) * 100) : 0,
    resumeLessonId: recentIncomplete?.lesson.id ?? incomplete[0]?.id ?? null,
    isCompleted: ordered.length > 0 && incomplete.length === 0,
  };
}
