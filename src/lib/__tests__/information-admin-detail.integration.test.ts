import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  libraryEntries,
  type AgentInformationItem,
} from "@/lib/db/schema";
import { getInformationSourceDestinations } from "@/lib/information-admin-detail";
import {
  cleanTestData,
  createTestCourse,
  createTestPlan,
  linkCourseToPlan,
} from "@/test/helpers";

function information(
  sourceType: AgentInformationItem["sourceType"],
  sourceId: string,
): AgentInformationItem {
  return {
    id: "information-1",
    dedupeKey: `${sourceType}:${sourceId}:1:test`,
    sourceType,
    sourceId,
    sourceVersion: "1",
    kind: sourceType === "library_entry" ? "library.published" : "course.announced",
    title: "測試 Information",
    summary: "測試摘要",
    whyItMatters: "",
    bodyMarkdown: "",
    audience: "all_users",
    actions: [],
    tags: [],
    status: "draft",
    revision: 1,
    publishedAt: null,
    expiresAt: null,
    withdrawnAt: null,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };
}

describe("Information admin source destinations", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("uses the durable Library id and slug for exact admin and public paths", async () => {
    const [entry] = await db.insert(libraryEntries).values({
      slug: "agent-guide",
      title: "Agent Guide",
      summary: "Guide summary",
      bodyMarkdown: "# Guide",
      status: "published",
      publishedAt: new Date("2026-07-30T00:00:00.000Z"),
    }).returning();

    const result = await getInformationSourceDestinations(
      information("library_entry", entry!.id),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          label: "Library 管理頁",
          href: `/admin/library/${entry!.id}`,
          kind: "admin",
        },
        {
          label: "Library 公開頁",
          href: "/library/agent-guide",
          kind: "public",
        },
      ],
    });
  });

  it("lists every active linked product instead of inventing one Course sales page", async () => {
    const course = await createTestCourse();
    const suffix = crypto.randomUUID().slice(0, 8);
    const firstSlug = `first-course-${suffix}`;
    const secondSlug = `second-course-${suffix}`;
    const firstPlan = await createTestPlan({ slug: firstSlug, name: "第一個商品" });
    const secondPlan = await createTestPlan({ slug: secondSlug, name: "第二個商品" });
    await linkCourseToPlan(course.id, firstPlan.id);
    await linkCourseToPlan(course.id, secondPlan.id);

    const result = await getInformationSourceDestinations(
      information("course", course.id),
    );

    expect(result).toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        {
          label: "課程管理頁",
          href: `/admin/courses/${course.id}`,
          kind: "admin",
        },
        {
          label: "商品頁：第一個商品",
          href: `/products/${firstSlug}`,
          kind: "public",
        },
        {
          label: "商品頁：第二個商品",
          href: `/products/${secondSlug}`,
          kind: "public",
        },
      ]),
    });
  });
});
