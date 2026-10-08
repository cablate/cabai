export type LearnerOutlineLesson = {
  id: string;
  title: string;
  type: string;
  duration: number | null;
  isPreview: boolean;
  completed: boolean;
  progress: number;
};

export type LearnerOutlineChapter = {
  id: string;
  title: string;
  lessons: LearnerOutlineLesson[];
};

export function getKnownRemainingDuration(
  chapters: LearnerOutlineChapter[],
): number {
  return chapters
    .flatMap((chapter) => chapter.lessons)
    .filter((lesson) => !lesson.completed)
    .reduce(
      (total, lesson) =>
        total +
        (lesson.duration != null && lesson.duration > 0 ? lesson.duration : 0),
      0,
    );
}

export function formatLearningDuration(totalSeconds: number): string | null {
  if (totalSeconds <= 0) return null;

  const totalMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
  if (totalMinutes < 60) return `約 ${totalMinutes} 分鐘`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `約 ${hours} 小時 ${minutes} 分鐘` : `約 ${hours} 小時`;
}

export function getDefaultOpenChapterId(
  chapters: LearnerOutlineChapter[],
  resumeLessonId: string | null,
  isCompleted: boolean,
): string | null {
  if (isCompleted) return null;

  if (resumeLessonId) {
    const resumeChapter = chapters.find((chapter) =>
      chapter.lessons.some((lesson) => lesson.id === resumeLessonId),
    );
    if (resumeChapter) return resumeChapter.id;
  }

  return chapters.find((chapter) => chapter.lessons.length > 0)?.id ?? null;
}
