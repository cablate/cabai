import { describe, expect, it } from "vitest";
import {
  MAX_SKILL_ARTIFACT_SIZE,
  generateStorageKey,
  getValidationRules,
  validateFileMetadata,
} from "./upload-validation";
import { mediaContextCanBindToEntity } from "./media-assets";

describe("skill-artifact upload policy", () => {
  it("accepts only bounded ZIP uploads", () => {
    expect(getValidationRules("skill-artifact")).toMatchObject({
      maxSize: MAX_SKILL_ARTIFACT_SIZE,
      allowedTypes: ["application/zip", "application/x-zip-compressed"],
    });
    expect(validateFileMetadata("skill.zip", "application/zip", 1, "skill-artifact")).toEqual({ valid: true });
    expect(validateFileMetadata("skill.zip", "application/x-7z-compressed", 1, "skill-artifact")).toMatchObject({ valid: false });
    expect(validateFileMetadata("skill.zip", "application/zip", MAX_SKILL_ARTIFACT_SIZE + 1, "skill-artifact")).toMatchObject({ valid: false });
  });

  it("requires Skill artifacts to bind to a Skill release", () => {
    expect(mediaContextCanBindToEntity("skill-artifact")).toBe(false);
    expect(mediaContextCanBindToEntity("skill-artifact", "skillRelease")).toBe(true);
    expect(mediaContextCanBindToEntity("skill-artifact", "lesson")).toBe(false);
  });

  it("keeps Skill artifact objects in the dedicated private prefix", () => {
    const key = generateStorageKey("skill-artifact", "my skill.zip", "user-1");
    expect(key).toMatch(/^uploads\/skill-artifact\/user-1\/\d+-[a-f0-9]{8}-my_skill\.zip$/);
  });
});
