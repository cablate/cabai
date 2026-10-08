import { describe, expect, it } from "vitest";
import {
  filterAndSortCourseRows,
  parseCourseListFilters,
  type CourseListRow,
} from "./course-list-view-model";

const rows: CourseListRow[] = [
  {
    id: "course-old",
    title: "Agent API 基礎",
    description: "從金鑰開始建立工作流",
    status: "published",
    chapterCount: 3,
    lessonCount: 12,
    planName: "Agent 實戰方案",
    planCount: 1,
    lastUpdatedAt: new Date("2026-07-01T00:00:00.000Z"),
    readiness: { ready: true, score: 100, issueCount: 0, blockingIssueCount: 0 },
  },
  {
    id: "course-new",
    title: "內容產品設計",
    description: null,
    status: "draft",
    chapterCount: 2,
    lessonCount: 8,
    planName: "創作者方案",
    planCount: 1,
    lastUpdatedAt: new Date("2026-07-20T00:00:00.000Z"),
    readiness: { ready: false, score: 72, issueCount: 2, blockingIssueCount: 1 },
  },
];

describe("course list view model", () => {
  it("normalizes unsupported query values to safe defaults", () => {
    expect(parseCourseListFilters({
      q: ["  Agent  ", "ignored"],
      status: "removed",
      readiness: "unknown",
      sort: "random",
    })).toEqual({
      q: "Agent",
      status: "all",
      readiness: "all",
      sort: "updated_desc",
    });
  });

  it("searches title, description and linked plan without changing source rows", () => {
    const result = filterAndSortCourseRows(rows, {
      q: "創作者",
      status: "all",
      readiness: "all",
      sort: "updated_desc",
    });

    expect(result.map((row) => row.id)).toEqual(["course-new"]);
    expect(rows).toHaveLength(2);
  });

  it("combines status and canonical readiness filters", () => {
    const result = filterAndSortCourseRows(rows, {
      q: "",
      status: "published",
      readiness: "ready",
      sort: "updated_desc",
    });

    expect(result.map((row) => row.id)).toEqual(["course-old"]);
  });

  it("sorts by last content update rather than course insertion order", () => {
    expect(filterAndSortCourseRows(rows, {
      q: "",
      status: "all",
      readiness: "all",
      sort: "updated_desc",
    }).map((row) => row.id)).toEqual(["course-new", "course-old"]);

    expect(filterAndSortCourseRows(rows, {
      q: "",
      status: "all",
      readiness: "all",
      sort: "updated_asc",
    }).map((row) => row.id)).toEqual(["course-old", "course-new"]);
  });
});
