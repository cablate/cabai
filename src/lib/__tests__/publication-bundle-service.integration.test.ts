import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/agent/openapi", () => ({
  buildAgentOpenApi: () => ({
    openapi: "3.0.3",
    info: { title: "WP-02 fixture", version: "1" },
    paths: {
      "/api/agent/public/v1/library/{idOrSlug}": {
        get: {
          operationId: "getPublicLibraryEntry",
          security: [],
          parameters: [{ name: "idOrSlug", in: "path", required: true }],
        },
      },
      "/api/agent/user/v1/skills/{id}/releases/{version}": {
        get: {
          operationId: "getUserSkillRelease",
          security: [{ userKey: [] }],
          "x-required-scope": "skill:read",
          parameters: [
            { name: "id", in: "path", required: true },
            { name: "version", in: "path", required: true },
          ],
        },
      },
      "/api/agent/courses/{id}/content": {
        get: {
          operationId: "getUserCourseContent",
          security: [{ userKey: [] }],
          "x-required-scope": "course:read",
          parameters: [{ name: "id", in: "path", required: true }],
        },
      },
      "/api/agent/internal/v1/reindex": {
        post: {
          operationId: "reindexInternal",
          security: [{ agentKey: [] }],
          "x-required-scope": "content:write",
          parameters: [],
        },
      },
    },
  }),
}));

import { eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import {
  agentInformationEvents,
  agentInformationItems,
  auditLogs,
  chapters,
  courses,
  lessons,
  libraryEntries,
  media,
  planPresentations,
  skillReleases,
  skills,
} from "@/lib/db/schema";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { createLibraryEntry, updateLibraryEntry } from "@/lib/services/library-service";
import {
  createInformationDraftFromSource,
  getInformationCoverage,
  publishInformation,
  validateInformationReadiness,
} from "@/lib/services/information-service";
import {
  publishLibraryInformationBundle,
  publishCourseInformationBundle,
  publishSkillInformationBundle,
} from "@/lib/services/publication-bundle-service";
import {
  createSkill,
  createSkillRelease,
} from "@/lib/services/skill-release-service";
import { bindAndValidateDraftSkillArtifact } from "@/lib/services/skill-artifact-service";
import {
  cleanTestData,
  createTestChapter,
  createTestCourse,
  createTestLesson,
  createTestPlan,
  createTestPresentation,
  createTestUser,
  linkCourseToPlan,
} from "@/test/helpers";
import { MemoryStorageProvider, VALID_SKILL_ZIP } from "@/test/skill-artifact-fixture";

const actor = { type: "agent" as const, id: "bundle-publisher" };
describe("Library/Skill required Information bundle publication", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("blocks standalone Information, rolls back a partial Library bundle, then publishes and replays atomically", async () => {
    const library = await createLibraryEntry({
      slug: "bundle-library",
      title: "Bundle Library",
      summary: "A publish bundle fixture.",
      bodyMarkdown: "Read the [Skill](/skills/example).",
      tags: ["fixture"],
      featured: false,
    });
    expect(library.ok).toBe(true);
    if (!library.ok) return;
    const information = await createInformationDraftFromSource({
      sourceType: "library_entry",
      sourceId: library.value.id,
      author: {
        kind: "library.published",
        title: "Library entry available",
        summary: "Read the new Library entry.",
        actionSelections: [{ rel: "library-entry" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;
    expect(information.value.sourceVersion).toBe("2");

    expect(await publishInformation({
      informationId: information.value.id,
      expectedRevision: 1,
      actor,
      idempotencyKey: "standalone-must-fail",
    })).toMatchObject({ ok: false, kind: "validation-failed" });

    const staleBundle = await publishLibraryInformationBundle({
      libraryId: library.value.id,
      expectedLibraryRevision: 1,
      informationId: information.value.id,
      expectedInformationRevision: 99,
      actor,
      idempotencyKey: "library-bundle-1",
    });
    expect(staleBundle).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.libraryEntries.findFirst({ where: eq(libraryEntries.id, library.value.id) }))
      .toMatchObject({ status: "draft", revision: 1 });
    expect(await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, information.value.id) }))
      .toMatchObject({ status: "draft", revision: 1 });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(0);
    expect(revalidateTag).not.toHaveBeenCalled();

    const input = {
      libraryId: library.value.id,
      expectedLibraryRevision: 1,
      informationId: information.value.id,
      expectedInformationRevision: 1,
      actor,
      idempotencyKey: "library-bundle-2",
    };
    const [published, concurrentReplay] = await Promise.all([
      publishLibraryInformationBundle(input),
      publishLibraryInformationBundle(input),
    ]);
    expect(published).toMatchObject({
      ok: true,
      value: {
        library: { status: "published", revision: 2 },
        information: { status: "published", sourceVersion: "2", revision: 2 },
      },
    });
    expect(concurrentReplay).toMatchObject({ ok: true, value: { library: { revision: 2 } } });
    expect(await publishLibraryInformationBundle(input)).toMatchObject({ ok: true, value: { library: { revision: 2 } } });
    expect(revalidateTag).toHaveBeenCalledWith("public-site-library", { expire: 0 });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(1);
    expect(await getInformationCoverage()).toMatchObject({ ok: true, value: { issues: [] } });

    expect(await updateLibraryEntry(library.value.id, {
      expectedRevision: 2,
      bodyMarkdown: "Corrected published Library body.",
    })).toMatchObject({ ok: true, value: { status: "published", revision: 3 } });
    const informationReadiness = await validateInformationReadiness(information.value.id);
    expect(informationReadiness.ok).toBe(true);
    if (informationReadiness.ok) {
      expect(informationReadiness.value.issues)
        .not.toContainEqual(expect.objectContaining({ field: "sourceVersion" }));
    }
    expect(await getInformationCoverage()).toMatchObject({ ok: true, value: { issues: [] } });
    expect(await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, information.value.id) }))
      .toMatchObject({ status: "published", sourceVersion: "2", revision: 2 });
  });

  it("publishes Skill, Release and required Information in one transaction", async () => {
    const user = await createTestUser();
    const storage = new MemoryStorageProvider();
    const skill = await createSkill({
      slug: "bundle-skill",
      title: "Bundle Skill",
      summary: "A Skill bundle fixture.",
      tags: ["fixture"],
    }, actor);
    expect(skill.ok).toBe(true);
    if (!skill.ok) return;
    const release = await createSkillRelease({
      skillId: skill.value.id,
      version: "1.0.0",
      compatibility: "Codex >= 1",
      license: "MIT",
      changelogMarkdown: "Initial release",
      accessPolicy: "authenticated",
    }, actor);
    expect(release.ok).toBe(true);
    if (!release.ok) return;
    const storageKey = `skills/${crypto.randomUUID()}.zip`;
    storage.put(storageKey, VALID_SKILL_ZIP);
    const [artifact] = await db.insert(media).values({
      storageKey,
      publicUrl: "/controlled-skill-download",
      filename: "skill.zip",
      mimeType: "application/zip",
      fileSize: VALID_SKILL_ZIP.byteLength,
      context: "skill-artifact",
      uploadedBy: user.id,
      status: "confirmed",
      entityType: "skillRelease",
      entityId: release.value.id,
      confirmedAt: new Date(),
    }).returning({ id: media.id });
    const bound = await bindAndValidateDraftSkillArtifact({
      releaseId: release.value.id,
      mediaId: artifact!.id,
      expectedRevision: release.value.revision,
    }, storage);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const information = await createInformationDraftFromSource({
      sourceType: "skill_release",
      sourceId: release.value.id,
      author: {
        kind: "skill.released",
        title: "Skill released",
        summary: "An authenticated Skill is available.",
        actionSelections: [{ rel: "skill-release" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    const published = await publishSkillInformationBundle({
      skillId: skill.value.id,
      releaseId: release.value.id,
      expectedSkillRevision: 1,
      expectedReleaseRevision: bound.value.release.revision,
      informationId: information.value.id,
      expectedInformationRevision: 1,
      actor,
      idempotencyKey: "skill-bundle-1",
    }, storage);
    expect(published).toMatchObject({
      ok: true,
      value: {
        skill: { status: "published", currentReleaseId: release.value.id },
        release: { status: "published", revision: bound.value.release.revision + 1 },
        information: { status: "published", revision: 2 },
      },
    });
    expect(revalidateTag).toHaveBeenCalledWith("public-site-skills", { expire: 0 });
    expect(await db.query.skills.findFirst({ where: eq(skills.id, skill.value.id) }))
      .toMatchObject({ currentReleaseId: release.value.id });
    expect(await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, release.value.id) }))
      .toMatchObject({ status: "published" });
  });

  it("publishes Course and Information atomically, then replays without duplicate side effects", async () => {
    const plan = await createTestPlan({ name: "Course bundle plan" });
    const alreadyPublishedPlan = await createTestPlan({ name: "Published presentation plan" });
    const course = await createTestCourse({
      title: "Course bundle",
      description: "A complete Course bundle fixture.",
      image: "course.jpg",
    });
    await linkCourseToPlan(course.id, plan.id);
    await linkCourseToPlan(course.id, alreadyPublishedPlan.id);
    const presentation = await createTestPresentation(plan.id);
    const alreadyPublishedPresentation = await createTestPresentation(alreadyPublishedPlan.id);
    const originalPublishedAt = new Date("2026-01-02T03:04:05.000Z");
    await db.update(planPresentations).set({ publishedAt: originalPublishedAt })
      .where(eq(planPresentations.id, alreadyPublishedPresentation.id));
    const chapter = await createTestChapter(course.id);
    const draftLesson = await createTestLesson(course.id, chapter.id, { isPreview: true });
    const publishedLesson = await createTestLesson(course.id, chapter.id, { status: "published" });
    const deletedLesson = await createTestLesson(course.id, chapter.id);
    await db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, deletedLesson.id));

    const information = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.published",
        title: "Course published",
        summary: "The complete Course is available.",
        actionSelections: [{ rel: "course-content" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    expect(await publishInformation({
      informationId: information.value.id,
      expectedRevision: information.value.revision,
      actor,
      idempotencyKey: "course-standalone-must-fail",
    })).toMatchObject({ ok: false, kind: "validation-failed" });

    const stale = await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: 99,
      actor,
      idempotencyKey: "course-bundle-stale",
    });
    expect(stale).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.courses.findFirst({ where: eq(courses.id, course.id) }))
      .toMatchObject({ status: "draft" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, draftLesson.id) }))
      .toMatchObject({ status: "draft" });
    expect(await db.query.planPresentations.findFirst({ where: eq(planPresentations.id, presentation.id) }))
      .toMatchObject({ publishedAt: null });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(0);

    const input = {
      courseId: course.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: 1,
      actor,
      idempotencyKey: "course-bundle-success",
    };
    const published = await publishCourseInformationBundle(input);
    expect(published).toMatchObject({
      ok: true,
      value: {
        course: { status: "published" },
        information: { status: "published", revision: 2 },
      },
    });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, draftLesson.id) }))
      .toMatchObject({ status: "published" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, publishedLesson.id) }))
      .toMatchObject({ status: "published" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, deletedLesson.id) }))
      .toMatchObject({ status: "draft" });
    expect((await db.query.planPresentations.findFirst({ where: eq(planPresentations.id, presentation.id) }))?.publishedAt)
      .toBeInstanceOf(Date);
    expect((await db.query.planPresentations.findFirst({ where: eq(planPresentations.id, alreadyPublishedPresentation.id) }))?.publishedAt)
      .toEqual(originalPublishedAt);
    expect(await db.select().from(agentInformationEvents)).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.entityId, course.id))).toHaveLength(1);

    const revalidationCount = vi.mocked(revalidatePath).mock.calls.length;
    const tagRevalidationCount = vi.mocked(revalidateTag).mock.calls.length;
    expect(await publishCourseInformationBundle(input)).toMatchObject({
      ok: true,
      value: {
        course: { status: "published" },
        information: { revision: 2 },
        linkedPlanIds: expect.arrayContaining([plan.id, alreadyPublishedPlan.id]),
      },
    });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.entityId, course.id))).toHaveLength(1);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(revalidationCount);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledTimes(tagRevalidationCount + 1);
  });

  it("rejects foreign and stale Course Information before any publish write", async () => {
    const plan = await createTestPlan({ name: "Stale Course bundle plan" });
    const course = await createTestCourse({ title: "Stale Course", description: "Complete", image: "course.jpg" });
    const otherCourse = await createTestCourse({ title: "Other Course" });
    await linkCourseToPlan(course.id, plan.id);
    await createTestPresentation(plan.id);
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id, { isPreview: true });
    const information = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.published",
        title: "Course published",
        summary: "The Course is available.",
        actionSelections: [{ rel: "course-content" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    expect(await publishCourseInformationBundle({
      courseId: otherCourse.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: 1,
      actor,
      idempotencyKey: "course-bundle-foreign",
    })).toMatchObject({ ok: false, kind: "conflict" });

    await db.update(courses).set({
      description: "Changed after the Information draft",
      updatedAt: new Date(Date.now() + 1_000),
    }).where(eq(courses.id, course.id));
    expect(await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: 1,
      actor,
      idempotencyKey: "course-bundle-source-stale",
    })).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.courses.findFirst({ where: eq(courses.id, course.id) }))
      .toMatchObject({ status: "draft" });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(0);
  });

  it("uses a deterministic material fingerprint and ignores lifecycle timestamps and pure ordering", async () => {
    const course = await createTestCourse({ title: "Fingerprint Course", description: "Material", image: "course.jpg" });
    const chapter = await createTestChapter(course.id, { title: "Fingerprint Chapter", sortOrder: 1 });
    const lesson = await createTestLesson(course.id, chapter.id, { title: "Fingerprint Lesson", content: "v1" });

    const initial = await buildInformationSourceBundle("course", course.id);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(initial.value.requiresBundlePublish).toBe(true);
    expect(initial.value.sourceVersion).toMatch(/^course-material:[a-f0-9]{64}$/);

    const timestamp = new Date("2030-01-02T03:04:05.000Z");
    await db.update(courses).set({ status: "published", sortOrder: 99, updatedAt: timestamp }).where(eq(courses.id, course.id));
    await db.update(chapters).set({ sortOrder: 88, updatedAt: timestamp }).where(eq(chapters.id, chapter.id));
    await db.update(lessons).set({ status: "published", sortOrder: 77, updatedAt: timestamp }).where(eq(lessons.id, lesson.id));
    const reordered = await buildInformationSourceBundle("course", course.id);
    expect(reordered).toMatchObject({ ok: true, value: { sourceVersion: initial.value.sourceVersion } });

    await db.update(lessons).set({ content: "v2" }).where(eq(lessons.id, lesson.id));
    const changed = await buildInformationSourceBundle("course", course.id);
    expect(changed.ok).toBe(true);
    if (changed.ok) expect(changed.value.sourceVersion).not.toBe(initial.value.sourceVersion);
  });

  it("includes API operation identity and authority in sourceVersion and rejects agent credentials", async () => {
    const operation = await buildInformationSourceBundle("api_operation", "getUserCourseContent");
    expect(operation.ok).toBe(true);
    if (!operation.ok) return;
    expect(JSON.parse(operation.value.sourceVersion)).toEqual({
      operationId: "getUserCourseContent",
      method: "get",
      path: "/api/agent/courses/{id}/content",
      credential: "user",
      scope: "course:read",
    });
    expect(operation.value.audience).toBe("all_users");
    expect(await buildInformationSourceBundle("api_operation", "reindexInternal"))
      .toMatchObject({ ok: false, kind: "not-found" });
  });

  it("enforces the caller sourceVersion CAS inside the Course transaction before writes", async () => {
    const plan = await createTestPlan({ name: "Course CAS plan" });
    const course = await createTestCourse({ title: "Course CAS", description: "Complete", image: "course.jpg" });
    await linkCourseToPlan(course.id, plan.id);
    await createTestPresentation(plan.id);
    const chapter = await createTestChapter(course.id);
    const lesson = await createTestLesson(course.id, chapter.id, { isPreview: true });
    const information = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.published",
        title: "Course CAS",
        summary: "The Course is available.",
        actionSelections: [{ rel: "course-content" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    expect(await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: `${information.value.sourceVersion}-stale-cas`,
      informationId: information.value.id,
      expectedInformationRevision: information.value.revision,
      actor,
      idempotencyKey: "course-cas-stale",
    })).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.courses.findFirst({ where: eq(courses.id, course.id) })).toMatchObject({ status: "draft" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) })).toMatchObject({ status: "draft" });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(0);
  });

  it("detects a lesson material race after outside readiness and before the Course lock", async () => {
    const plan = await createTestPlan({ name: "Course race plan" });
    const course = await createTestCourse({ title: "Course race", description: "Complete", image: "course.jpg" });
    await linkCourseToPlan(course.id, plan.id);
    await createTestPresentation(plan.id);
    const chapter = await createTestChapter(course.id);
    const lesson = await createTestLesson(course.id, chapter.id, { isPreview: true, content: "before-race" });
    const information = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.published",
        title: "Course race",
        summary: "The Course is available.",
        actionSelections: [{ rel: "course-content" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    let releaseMutation!: () => void;
    let mutationReady!: () => void;
    const release = new Promise<void>((resolve) => { releaseMutation = resolve; });
    const ready = new Promise<void>((resolve) => { mutationReady = resolve; });
    const mutation = db.transaction(async (tx) => {
      await tx.execute(sql`select ${courses.id} from ${courses} where ${courses.id} = ${course.id} for update`);
      await tx.update(lessons).set({ content: "after-race" }).where(eq(lessons.id, lesson.id));
      mutationReady();
      await release;
    });
    await ready;
    const publication = publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: information.value.revision,
      actor,
      idempotencyKey: "course-material-race",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseMutation();
    await mutation;

    expect(await publication).toMatchObject({ ok: false, kind: "stale-revision" });
    expect(await db.query.courses.findFirst({ where: eq(courses.id, course.id) })).toMatchObject({ status: "draft" });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, lesson.id) })).toMatchObject({ status: "draft", content: "after-race" });
    expect(await db.select().from(agentInformationEvents)).toHaveLength(0);
  });

  it("publishes a material update for a published Course when an active draft lesson exists", async () => {
    const plan = await createTestPlan({ name: "Published Course update plan" });
    const course = await createTestCourse({ title: "Published Course update", status: "published", description: "Complete", image: "course.jpg" });
    await linkCourseToPlan(course.id, plan.id);
    await createTestPresentation(plan.id);
    const chapter = await createTestChapter(course.id);
    const draftLesson = await createTestLesson(course.id, chapter.id, { isPreview: true, content: "new material" });
    const information = await createInformationDraftFromSource({
      sourceType: "course",
      sourceId: course.id,
      author: {
        kind: "course.published",
        title: "Course material updated",
        summary: "New Course material is available.",
        actionSelections: [{ rel: "course-content" }],
      },
    });
    expect(information.ok).toBe(true);
    if (!information.ok) return;

    expect(await publishCourseInformationBundle({
      courseId: course.id,
      sourceVersion: information.value.sourceVersion,
      informationId: information.value.id,
      expectedInformationRevision: information.value.revision,
      actor,
      idempotencyKey: "published-course-material-update",
    })).toMatchObject({
      ok: true,
      value: {
        course: { status: "published" },
        information: { status: "published", sourceVersion: information.value.sourceVersion },
      },
    });
    expect(await db.query.lessons.findFirst({ where: eq(lessons.id, draftLesson.id) })).toMatchObject({ status: "published" });
  });

  it("does not backfill Information or report missing coverage for a clean legacy published Course", async () => {
    const course = await createTestCourse({ title: "Legacy published Course", status: "published" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id, { status: "published" });

    const coverage = await getInformationCoverage();
    expect(coverage.ok).toBe(true);
    if (coverage.ok) {
      expect(coverage.value.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "missing_information", sourceType: "course", sourceId: course.id }),
      ]));
    }
    expect(await db.select().from(agentInformationItems)).toHaveLength(0);
  });
});
