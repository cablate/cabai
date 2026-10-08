import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getEntitledPlanIds: vi.fn(),
  checkCourseAccess: vi.fn(),
  courseFindFirst: vi.fn(),
  lessonFindFirst: vi.fn(),
  chapterFindFirst: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/course-access", () => ({
  checkCourseAccess: mocks.checkCourseAccess,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      courses: { findFirst: mocks.courseFindFirst },
      lessons: { findFirst: mocks.lessonFindFirst },
      chapters: { findFirst: mocks.chapterFindFirst },
    },
    select: mocks.select,
  },
}));

vi.mock("@/lib/access", () => ({ getEntitledPlanIds: mocks.getEntitledPlanIds }));
vi.mock("@/lib/services/course-service", () => ({
  archiveCourseStatus: vi.fn(),
  restoreChapter: vi.fn(),
  restoreCourse: vi.fn(),
  restoreLesson: vi.fn(),
  unarchiveCourseStatus: vi.fn(),
}));

import {
  getUserCourseContent,
  listUserTokenCourses,
  listUserTokenCourseSummaries,
} from "./agent-content-service";

const publishedCourse = {
  id: "course-1",
  title: "Published course",
  description: "Course description",
  status: "published",
  updatedAt: new Date("2026-07-17T00:00:00.000Z"),
};

const chapter = {
  id: "chapter-1",
  courseId: "course-1",
  title: "Chapter 1",
  sortOrder: 1,
};

const publishedLesson = {
  id: "lesson-published",
  courseId: "course-1",
  chapterId: "chapter-1",
  title: "Published lesson",
  type: "text",
  content: "Visible content",
  resourcesJson: [],
  duration: null,
  sortOrder: 1,
  status: "published",
};

const draftLesson = {
  ...publishedLesson,
  id: "lesson-draft",
  title: "Draft lesson",
  content: "Hidden content",
  sortOrder: 2,
  status: "draft",
};

function selectRows(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(rows),
        then: promise.then.bind(promise),
      })),
    })),
  };
}

describe("legacy user-token course listing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not query courses without an entitlement", async () => {
    mocks.getEntitledPlanIds.mockResolvedValue(new Set());
    await expect(listUserTokenCourses("user-1")).resolves.toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("limits the query to published, non-deleted entitled courses without changing the legacy row shape", async () => {
    mocks.getEntitledPlanIds.mockResolvedValue(new Set(["plan-1"]));
    const where = vi.fn<(condition: SQL) => unknown>()
      .mockReturnValue({ orderBy: vi.fn().mockResolvedValue([publishedCourse]) });
    mocks.select
      .mockImplementationOnce(() => selectRows([{ courseId: "course-1" }]))
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where })) }));
    await expect(listUserTokenCourses("user-1")).resolves.toEqual([publishedCourse]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0]);
    expect(query.params).toEqual(["course-1", "published"]);
    expect(query.sql).toContain('"courses"."course_status" =');
    expect(query.sql).toContain('"courses"."deleted_at" is null');
  });
});

describe("listUserTokenCourseSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no courses and performs no course lookup without entitled plans", async () => {
    mocks.getEntitledPlanIds.mockResolvedValue(new Set());

    await expect(listUserTokenCourseSummaries("user-1")).resolves.toEqual([]);

    expect(mocks.getEntitledPlanIds).toHaveBeenCalledWith("user-1");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses entitled active links and projects only discovery fields", async () => {
    const updatedAt = new Date("2026-07-17T00:00:00.000Z");
    mocks.getEntitledPlanIds.mockResolvedValue(new Set(["plan-1"]));
    mocks.select
      .mockImplementationOnce(() => selectRows([{ courseId: "course-1" }]))
      .mockImplementationOnce(() => selectRows([{
        id: "course-1",
        title: "Published course",
        description: "Course description",
        image: "https://example.com/course.png",
        updatedAt,
        status: "published",
        sortOrder: 99,
        deletedAt: null,
        deletedBy: "admin-1",
        lessons: [{ content: "must not be exposed" }],
      }]));

    await expect(listUserTokenCourseSummaries("user-1")).resolves.toEqual([{
      id: "course-1",
      title: "Published course",
      description: "Course description",
      image: "https://example.com/course.png",
      updatedAt,
    }]);
  });
});

describe("getUserCourseContent read-plane visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: true, planId: "plan-1" });
  });

  it("fails closed before entitlement lookup when the course is draft", async () => {
    mocks.courseFindFirst.mockResolvedValue({ ...publishedCourse, status: "draft" });

    await expect(getUserCourseContent("user-1", "course-1", null))
      .resolves.toEqual({ kind: "course-not-found" });
    expect(mocks.checkCourseAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("preserves entitlement denial for a published course", async () => {
    mocks.courseFindFirst.mockResolvedValue(publishedCourse);
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: false, planId: null });

    await expect(getUserCourseContent("user-1", "course-1", null))
      .resolves.toEqual({ kind: "forbidden" });
    expect(mocks.checkCourseAccess).toHaveBeenCalledWith("course-1", "user-1");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns only published lessons in the entitled course outline", async () => {
    mocks.courseFindFirst.mockResolvedValue(publishedCourse);
    mocks.select
      .mockImplementationOnce(() => selectRows([chapter]))
      .mockImplementationOnce(() => selectRows([publishedLesson, draftLesson]));

    const result = await getUserCourseContent("user-1", "course-1", null);

    expect(result.kind).toBe("ok");
    expect(result).toMatchObject({
      data: {
        purchase: { orderId: "plan-1", entitlement: "full_access" },
        content: {
          chapters: [{
            id: "chapter-1",
            lessons: [{ id: "lesson-published", title: "Published lesson" }],
          }],
        },
      },
    });
  });

  it("returns lesson-not-found when an entitled user requests a draft lesson directly", async () => {
    mocks.courseFindFirst.mockResolvedValue(publishedCourse);
    mocks.lessonFindFirst.mockResolvedValue(draftLesson);

    await expect(getUserCourseContent("user-1", "course-1", "lesson-draft"))
      .resolves.toEqual({ kind: "lesson-not-found" });
    expect(mocks.checkCourseAccess).toHaveBeenCalledWith("course-1", "user-1");
    expect(mocks.chapterFindFirst).not.toHaveBeenCalled();
  });

  it("keeps entitled published lesson detail available", async () => {
    mocks.courseFindFirst.mockResolvedValue(publishedCourse);
    mocks.lessonFindFirst.mockResolvedValue(publishedLesson);
    mocks.chapterFindFirst.mockResolvedValue(chapter);

    await expect(getUserCourseContent("user-1", "course-1", "lesson-published"))
      .resolves.toMatchObject({
        kind: "ok",
        data: {
          course: { id: "course-1", title: "Published course" },
          chapter: { id: "chapter-1", title: "Chapter 1" },
          lesson: { id: "lesson-published", content: "Visible content" },
        },
      });
  });
});
