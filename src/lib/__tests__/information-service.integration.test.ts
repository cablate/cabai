import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
import { db } from "@/lib/db";
import { agentInformationEvents, agentInformationItems } from "@/lib/db/schema";
import {
  createInformationDraftFromSource,
  getInformationStats,
  listAdminInformationPage,
  listInformation,
  listPublishedPublicInformation,
  publishInformation,
  updateInformationDraft,
  validateInformationReadiness,
  withdrawInformation,
} from "@/lib/services/information-service";
import { publishCourseInformationBundle } from "@/lib/services/publication-bundle-service";
import { acknowledgeInformation, getVisibleInformation, listUnreadInformation } from "@/lib/services/user-information-service";
import {
  cleanTestData,
  createTestChapter,
  createTestCourse,
  createTestLesson,
  createTestOrder,
  createTestPlan,
  createTestPresentation,
  createTestPurchase,
  createTestUser,
  linkCourseToPlan,
} from "@/test/helpers";

async function createEntitledCourseFixture() {
  const user = await createTestUser();
  const outsider = await createTestUser();
  const plan = await createTestPlan();
  const order = await createTestOrder(user.id, plan.id, { status: "completed" });
  await createTestPurchase(user.id, plan.id, order.id);
  const course = await createTestCourse({ status: "draft", description: "A complete test course", image: "course.jpg" });
  await linkCourseToPlan(course.id, plan.id);
  await createTestPresentation(plan.id);
  const chapter = await createTestChapter(course.id);
  await createTestLesson(course.id, chapter.id, { isPreview: true });
  return { user, outsider, course };
}

async function createCourseInformationDraft(courseId: string, resourceId?: string) {
  return createInformationDraftFromSource({
    sourceType: "course",
    sourceId: courseId,
    resourceId,
    author: {
      kind: "course.published",
      title: "A course is now available",
      summary: "Open the course API to inspect the latest content.",
      whyItMatters: "The entitled user can continue learning.",
      actionSelections: [{ rel: "course-content" }],
      tags: ["course"],
    },
  });
}

describe("Information canonical services", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("rejects stale draft updates without overwriting the newer revision", async () => {
    const { course } = await createEntitledCourseFixture();
    const created = await createCourseInformationDraft(course.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await updateInformationDraft(created.value.id, {
      title: "First accepted edit",
      expectedRevision: created.value.revision,
    });
    expect(first).toMatchObject({ ok: true, value: { revision: 2, title: "First accepted edit" } });

    const stale = await updateInformationDraft(created.value.id, {
      title: "Stale overwrite",
      expectedRevision: created.value.revision,
    });
    expect(stale).toMatchObject({ ok: false, kind: "stale-revision" });
    const stored = await db.query.agentInformationItems.findFirst();
    expect(stored).toMatchObject({ revision: 2, title: "First accepted edit" });
  });

  it("accepts a server-owned deterministic ID for retry-safe Agent creates", async () => {
    const { course } = await createEntitledCourseFixture();
    const resourceId = `idem_${"a".repeat(48)}`;
    const created = await createCourseInformationDraft(course.id, resourceId);
    expect(created).toMatchObject({ ok: true, value: { id: resourceId } });
  });

  it("publishes with an authoritative event and safely replays the same idempotency key", async () => {
    const { course } = await createEntitledCourseFixture();
    const created = await createCourseInformationDraft(course.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const readiness = await validateInformationReadiness(created.value.id);
    expect(readiness).toMatchObject({ ok: true, value: { ready: false } });

    const input = {
      courseId: course.id,
      sourceVersion: created.value.sourceVersion,
      informationId: created.value.id,
      expectedInformationRevision: created.value.revision,
      actor: { type: "agent" as const, id: "publisher-test" },
      idempotencyKey: `publish:${created.value.id}:1`,
    };
    const [published, concurrentReplay] = await Promise.all([
      publishCourseInformationBundle(input),
      publishCourseInformationBundle(input),
    ]);
    expect(published, JSON.stringify([published, concurrentReplay])).toMatchObject({ ok: true, value: { information: { status: "published", revision: 2 } } });
    expect(concurrentReplay).toMatchObject({ ok: true, value: { information: { status: "published", revision: 2 } } });
    const replay = await publishCourseInformationBundle(input);
    expect(replay).toMatchObject({ ok: true, value: { information: { status: "published", revision: 2 } } });
    const events = await db.select().from(agentInformationEvents);
    expect(events).toHaveLength(1);
  });

  it("keeps summary/detail boundaries and user-scoped ACK state stable", async () => {
    const { user, outsider, course } = await createEntitledCourseFixture();
    const created = await createCourseInformationDraft(course.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const published = await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: created.value.sourceVersion,
      informationId: created.value.id,
      expectedInformationRevision: created.value.revision,
      actor: { type: "agent", id: "publisher-test" },
      idempotencyKey: `publish:${created.value.id}:1`,
    });
    expect(published.ok, JSON.stringify(published)).toBe(true);

    const entitledUnread = await listUnreadInformation({ userId: user.id });
    expect(entitledUnread).toMatchObject({ ok: true, value: { items: [{ id: created.value.id }] } });
    if (entitledUnread.ok) expect(entitledUnread.value.items[0]).toHaveProperty("bodyMarkdown");

    const entitledSummary = await listUnreadInformation({ userId: user.id, include: "summary" });
    expect(entitledSummary).toMatchObject({ ok: true, value: { items: [{ id: created.value.id }] } });
    if (entitledSummary.ok) expect(entitledSummary.value.items[0]).not.toHaveProperty("bodyMarkdown");

    expect(await getVisibleInformation({ userId: user.id, informationId: created.value.id }))
      .toMatchObject({ ok: true, value: { id: created.value.id, bodyMarkdown: expect.any(String) } });
    expect(await getVisibleInformation({ userId: outsider.id, informationId: created.value.id }))
      .toMatchObject({ ok: false, kind: "forbidden" });

    const outsiderUnread = await listUnreadInformation({ userId: outsider.id });
    expect(outsiderUnread).toMatchObject({ ok: true, value: { items: [] } });
    expect(await acknowledgeInformation({ userId: user.id, informationIds: [created.value.id] }))
      .toMatchObject({ ok: true, value: { acknowledged: [created.value.id] } });
    expect(await getInformationStats(created.value.id)).toMatchObject({
      ok: true,
      value: { eligible: 1, read: 1, unread: 0 },
    });
    expect(await acknowledgeInformation({ userId: user.id, informationIds: [created.value.id] }))
      .toMatchObject({ ok: true, value: { acknowledged: [created.value.id] } });
    expect(await listUnreadInformation({ userId: user.id }))
      .toMatchObject({ ok: true, value: { items: [] } });
    expect(await acknowledgeInformation({ userId: outsider.id, informationIds: [created.value.id] }))
      .toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("continues scanning past ineligible rows instead of hiding an older visible item", async () => {
    const user = await createTestUser();
    const now = Date.now();
    await db.insert(agentInformationItems).values(Array.from({ length: 8 }, (_, index) => ({
      dedupeKey: `course:ineligible-${index}:1`,
      sourceType: "course" as const,
      sourceId: `ineligible-${index}`,
      sourceVersion: "1",
      kind: "course.published",
      title: `Ineligible ${index}`,
      summary: "Not visible to this user",
      audience: "source_entitled" as const,
      status: "published" as const,
      publishedAt: new Date(now - index * 1000),
    })));
    const [visible] = await db.insert(agentInformationItems).values({
      dedupeKey: "api_operation:public-visible:1",
      sourceType: "api_operation",
      sourceId: "public-visible",
      sourceVersion: "1",
      kind: "api.capability-added",
      title: "Visible item",
      summary: "This older item must still be returned",
      audience: "all_users",
      status: "published",
      publishedAt: new Date(now - 20_000),
    }).returning({ id: agentInformationItems.id });

    const result = await listUnreadInformation({ userId: user.id, limit: 2 });
    expect(result).toMatchObject({ ok: true, value: { items: [{ id: visible!.id }] } });
  });

  it("withdraws without deleting history or user read mappings", async () => {
    const { user, course } = await createEntitledCourseFixture();
    const created = await createCourseInformationDraft(course.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: created.value.sourceVersion,
      informationId: created.value.id,
      expectedInformationRevision: created.value.revision,
      actor: { type: "agent", id: "publisher-test" },
      idempotencyKey: `publish:${created.value.id}:1`,
    });
    await acknowledgeInformation({ userId: user.id, informationIds: [created.value.id] });
    const withdrawn = await withdrawInformation({
      informationId: created.value.id,
      expectedRevision: 2,
      actor: { type: "agent", id: "publisher-test" },
      idempotencyKey: `withdraw:${created.value.id}:2`,
    });
    expect(withdrawn).toMatchObject({ ok: true, value: { status: "withdrawn", revision: 3 } });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(2);
  });

  it("publishes standalone and public course announcements without changing entitled course notices", async () => {
    const manual = await createInformationDraftFromSource({
      sourceType: "manual_announcement",
      author: {
        kind: "manual.announcement",
        title: "Scheduled maintenance",
        summary: "The site will be briefly unavailable.",
      },
    });
    const course = await createTestCourse({ status: "published", description: "A public course introduction" });
    const publicCourse = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.announced",
        title: "A new course is available",
        summary: "Learn the public course overview before deciding to enroll.",
      },
    });

    expect(manual).toMatchObject({ ok: true, value: { audience: "all_users", actions: [] } });
    expect(publicCourse).toMatchObject({ ok: true, value: { audience: "all_users", actions: [] } });
    if (!manual.ok || !publicCourse.ok) return;

    await expect(publishInformation({
      informationId: manual.value.id,
      expectedRevision: manual.value.revision,
      actor: { type: "system", id: "test" },
      idempotencyKey: `publish:${manual.value.id}`,
    })).resolves.toMatchObject({ ok: true, value: { status: "published" } });
    await expect(publishInformation({
      informationId: publicCourse.value.id,
      expectedRevision: publicCourse.value.revision,
      actor: { type: "system", id: "test" },
      idempotencyKey: `publish:${publicCourse.value.id}`,
    })).resolves.toMatchObject({ ok: true, value: { status: "published" } });

    const publicFeed = await listPublishedPublicInformation();
    expect(publicFeed).toMatchObject({ ok: true, value: expect.arrayContaining([
      expect.objectContaining({ id: manual.value.id, href: null }),
      expect.objectContaining({ id: publicCourse.value.id, href: null }),
    ]) });
  });

  it("pages the admin work view without changing the existing list contract", async () => {
    const now = new Date("2026-07-30T08:00:00.000Z");
    await db.insert(agentInformationItems).values(Array.from({ length: 25 }, (_, index) => ({
      id: `admin-page-${String(index).padStart(2, "0")}`,
      dedupeKey: `admin-page:${index}`,
      sourceType: "manual_announcement" as const,
      sourceId: `announcement-${index}`,
      sourceVersion: "1",
      kind: "manual.announcement",
      title: index === 7 ? "Codex release notes" : `Announcement ${index}`,
      summary: `Summary ${index}`,
      audience: "all_users" as const,
      status: "draft" as const,
      updatedAt: new Date(now.getTime() - index * 1_000),
    })));

    const firstPage = await listAdminInformationPage({ view: "active" }, now);
    const secondPage = await listAdminInformationPage({ view: "active", page: 2 }, now);
    const searched = await listAdminInformationPage({ view: "active", query: "codex" }, now);
    const existingContract = await listInformation({ sourceType: "manual_announcement" });

    expect(firstPage).toMatchObject({
      ok: true,
      value: { page: 1, pageSize: 20, totalItems: 25, totalPages: 2 },
    });
    expect(secondPage).toMatchObject({
      ok: true,
      value: { page: 2, totalItems: 25, totalPages: 2 },
    });
    if (firstPage.ok) expect(firstPage.value.items).toHaveLength(20);
    if (secondPage.ok) expect(secondPage.value.items).toHaveLength(5);
    if (searched.ok) expect(searched.value.items.map((item) => item.title)).toEqual(["Codex release notes"]);
    expect(existingContract.ok && Array.isArray(existingContract.value)).toBe(true);
  });

  it("separates active Information from withdrawn and expired history", async () => {
    const now = new Date("2026-07-30T08:00:00.000Z");
    const publishedAt = new Date("2026-07-29T08:00:00.000Z");
    await db.insert(agentInformationItems).values([
      {
        id: "active-draft",
        dedupeKey: "active-draft",
        sourceType: "manual_announcement",
        sourceId: "active-draft",
        sourceVersion: "1",
        kind: "manual.announcement",
        title: "Active draft",
        summary: "Still being written",
        status: "draft",
      },
      {
        id: "active-published",
        dedupeKey: "active-published",
        sourceType: "manual_announcement",
        sourceId: "active-published",
        sourceVersion: "1",
        kind: "manual.announcement",
        title: "Active published",
        summary: "Currently visible",
        status: "published",
        publishedAt,
        expiresAt: new Date("2026-08-01T08:00:00.000Z"),
      },
      {
        id: "expired-published",
        dedupeKey: "expired-published",
        sourceType: "manual_announcement",
        sourceId: "expired-published",
        sourceVersion: "1",
        kind: "manual.announcement",
        title: "Expired published",
        summary: "No longer active",
        status: "published",
        publishedAt,
        expiresAt: new Date("2026-07-30T07:00:00.000Z"),
      },
      {
        id: "withdrawn-item",
        dedupeKey: "withdrawn-item",
        sourceType: "manual_announcement",
        sourceId: "withdrawn-item",
        sourceVersion: "1",
        kind: "manual.announcement",
        title: "Withdrawn item",
        summary: "Removed from circulation",
        status: "withdrawn",
        publishedAt,
        withdrawnAt: new Date("2026-07-30T07:30:00.000Z"),
      },
    ]);

    const active = await listAdminInformationPage({ view: "active" }, now);
    const history = await listAdminInformationPage({ view: "history" }, now);

    if (active.ok) expect(active.value.items.map((item) => item.id).sort()).toEqual([
      "active-draft",
      "active-published",
    ]);
    if (history.ok) expect(history.value.items.map((item) => item.id).sort()).toEqual([
      "expired-published",
      "withdrawn-item",
    ]);
  });

});
