import { describe, expect, it } from "vitest";
import { resolveCourseLearningState } from "./learning-progress";

const lessons = [
  { id: "lesson-b", chapterSortOrder: 1, lessonSortOrder: 0 },
  { id: "lesson-a", chapterSortOrder: 0, lessonSortOrder: 1 },
  { id: "lesson-c", chapterSortOrder: 1, lessonSortOrder: 1 },
];

describe("resolveCourseLearningState", () => {
  it("uses curriculum order before learning starts", () => {
    expect(resolveCourseLearningState(lessons, []).resumeLessonId).toBe("lesson-a");
  });

  it("resumes the most recently accessed incomplete lesson", () => {
    const state = resolveCourseLearningState(lessons, [
      { lessonId: "lesson-a", completed: true, progress: 100, lastAccessedAt: new Date("2026-07-10") },
      { lessonId: "lesson-b", completed: false, progress: 20, lastAccessedAt: new Date("2026-07-11") },
      { lessonId: "lesson-c", completed: false, progress: 10, lastAccessedAt: new Date("2026-07-09") },
    ]);
    expect(state).toMatchObject({ resumeLessonId: "lesson-b", completedLessonCount: 1, progressPercent: 33 });
  });

  it("does not reopen arbitrary content after completion", () => {
    const rows = lessons.map((lesson) => ({ lessonId: lesson.id, completed: true, progress: 100, lastAccessedAt: new Date() }));
    expect(resolveCourseLearningState(lessons, rows)).toMatchObject({ resumeLessonId: null, isCompleted: true, progressPercent: 100 });
  });
});
