import { describe, expect, it } from "vitest";
import {
  uploadConfirmRequestSchema,
  uploadSignedUrlRequestSchema,
} from "./upload-types";

describe("Skill artifact upload contract", () => {
  it("accepts the dedicated ZIP upload context", () => {
    expect(uploadSignedUrlRequestSchema.safeParse({
      filename: "skill.zip",
      contentType: "application/zip",
      fileSize: 1024,
      context: "skill-artifact",
    }).success).toBe(true);
  });

  it("requires a Skill release target and optimistic revision on confirm", () => {
    expect(uploadConfirmRequestSchema.safeParse({
      storageKey: "uploads/skill-artifact/user/skill.zip",
      entityType: "skillRelease",
      entityId: "release-1",
    }).success).toBe(false);
    expect(uploadConfirmRequestSchema.safeParse({
      storageKey: "uploads/skill-artifact/user/skill.zip",
      entityType: "skillRelease",
      entityId: "release-1",
      expectedEntityRevision: 2,
    }).success).toBe(true);
    expect(uploadConfirmRequestSchema.safeParse({
      storageKey: "uploads/skill-artifact/user/skill.zip",
      entityType: "lesson",
      entityId: "lesson-1",
    }).success).toBe(true);
  });
});
