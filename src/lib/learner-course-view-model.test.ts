import { describe, expect, it } from "vitest";
import {
  formatLearningDuration,
  getDefaultOpenChapterId,
  getKnownRemainingDuration,
  type LearnerOutlineChapter,
} from "./learner-course-view-model";

const chapters: LearnerOutlineChapter[] = [
  {
    id: "chapter-1",
    title: "開始",
    lessons: [
      {
        id: "lesson-1",
        title: "已完成",
        type: "video",
        duration: 600,
        isPreview: false,
        completed: true,
        progress: 100,
      },
      {
        id: "lesson-2",
        title: "接著學",
        type: "video",
        duration: 3_600,
        isPreview: false,
        completed: false,
        progress: 20,
      },
    ],
  },
  {
    id: "chapter-2",
    title: "進階",
    lessons: [
      {
        id: "lesson-3",
        title: "沒有標示時間",
        type: "text",
        duration: null,
        isPreview: false,
        completed: false,
        progress: 0,
      },
      {
        id: "lesson-4",
        title: "短課",
        type: "video",
        duration: 90,
        isPreview: false,
        completed: false,
        progress: 0,
      },
    ],
  },
];

describe("learner course view model", () => {
  it("sums only known durations from incomplete lessons", () => {
    expect(getKnownRemainingDuration(chapters)).toBe(3_690);
    expect(formatLearningDuration(3_690)).toBe("約 1 小時 2 分鐘");
  });

  it("does not invent a duration when no positive duration exists", () => {
    expect(formatLearningDuration(0)).toBeNull();
  });

  it("opens the resume chapter, then the first chapter for a new learner", () => {
    expect(getDefaultOpenChapterId(chapters, "lesson-3", false)).toBe(
      "chapter-2",
    );
    expect(getDefaultOpenChapterId(chapters, null, false)).toBe("chapter-1");
  });

  it("does not force a chapter open after course completion", () => {
    expect(getDefaultOpenChapterId(chapters, null, true)).toBeNull();
  });
});
