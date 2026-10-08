import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LearnerCourseOutline } from "./learner-course-outline";
import type { LearnerOutlineChapter } from "@/lib/learner-course-view-model";

const chapters: LearnerOutlineChapter[] = [
  {
    id: "chapter-1",
    title: "第一章",
    lessons: [
      {
        id: "lesson-1",
        title: "已完成的課堂",
        type: "video",
        duration: 300,
        isPreview: false,
        completed: true,
        progress: 100,
      },
    ],
  },
  {
    id: "chapter-2",
    title: "第二章",
    lessons: [
      {
        id: "lesson-2",
        title: "接著學這一堂",
        type: "text",
        duration: null,
        isPreview: false,
        completed: false,
        progress: 30,
      },
    ],
  },
];

describe("LearnerCourseOutline", () => {
  it("opens only the current progress chapter by default", () => {
    render(
      <LearnerCourseOutline
        courseId="course-1"
        chapters={chapters}
        resumeLessonId="lesson-2"
        defaultOpenChapterId="chapter-2"
      />,
    );

    expect(screen.getByRole("button", { name: /第一章/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /第二章/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("接著學這一堂")).toBeInTheDocument();
    expect(screen.queryByText("已完成的課堂")).not.toBeInTheDocument();
  });

  it("lets the learner reveal another chapter without changing progress", async () => {
    const user = userEvent.setup();
    render(
      <LearnerCourseOutline
        courseId="course-1"
        chapters={chapters}
        resumeLessonId="lesson-2"
        defaultOpenChapterId="chapter-2"
      />,
    );

    await user.click(screen.getByRole("button", { name: /第一章/ }));
    expect(screen.getByText("已完成的課堂")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /已完成的課堂/ }),
    ).toHaveAttribute(
      "href",
      "/courses/course-1/lessons/lesson-1",
    );
  });
});
