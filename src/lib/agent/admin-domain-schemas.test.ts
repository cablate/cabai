import { describe, expect, it } from "vitest";
import {
  informationCreateSchema,
  informationListQuerySchema,
  libraryBundlePublishSchema,
  skillBundlePublishSchema,
} from "./admin-domain-schemas";

describe("Admin Library/Skill/Information route schemas", () => {
  it("keeps server-owned Information fields out of create input", () => {
    const base = {
      sourceType: "library_entry",
      sourceId: "library-1",
      kind: "library.published",
      title: "A useful note",
      summary: "A summary",
    };
    expect(informationCreateSchema.safeParse(base).success).toBe(true);
    expect(informationCreateSchema.safeParse({ ...base, audience: "all_users" }).success).toBe(false);
    expect(informationCreateSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
    expect(informationCreateSchema.safeParse({ ...base, revision: 1 }).success).toBe(false);
  });

  it("requires sourceType when filtering by sourceId", () => {
    expect(informationListQuerySchema.safeParse({ sourceId: "course-1" }).success).toBe(false);
    expect(informationListQuerySchema.safeParse({ sourceType: "course", sourceId: "course-1" }).success).toBe(true);
  });

  it("allows standalone manual Information without a source ID", () => {
    expect(informationCreateSchema.safeParse({
      sourceType: "manual_announcement",
      kind: "manual.announcement",
      title: "Scheduled maintenance",
      summary: "The site will be briefly unavailable.",
    }).success).toBe(true);
  });

  it("requires both domain and Information revisions for Library publish", () => {
    expect(libraryBundlePublishSchema.safeParse({
      libraryId: "library-1",
      informationId: "info-1",
      expectedLibraryRevision: 1,
      expectedInformationRevision: 1,
    }).success).toBe(true);
    expect(libraryBundlePublishSchema.safeParse({
      libraryId: "library-1",
      informationId: "info-1",
      expectedLibraryRevision: 1,
    }).success).toBe(false);
  });

  it("requires explicit Skill and release identity for either publish alias", () => {
    expect(skillBundlePublishSchema.safeParse({
      skillId: "skill-1",
      releaseId: "release-1",
      informationId: "info-1",
      expectedSkillRevision: 1,
      expectedReleaseRevision: 1,
      expectedInformationRevision: 1,
    }).success).toBe(true);
  });
});
