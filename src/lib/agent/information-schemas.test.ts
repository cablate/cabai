import { describe, expect, it } from "vitest";
import { informationAuthorInputSchema } from "./information-schemas";

describe("Information author schema", () => {
  it("accepts only authorable fields", () => {
    expect(informationAuthorInputSchema.safeParse({
      kind: "skill.released",
      title: "Skill v1",
      summary: "A new release",
      actionSelections: [{ rel: "skill-release" }],
    }).success).toBe(true);
  });

  it("accepts a standalone manual announcement without an action", () => {
    expect(informationAuthorInputSchema.safeParse({
      kind: "manual.announcement",
      title: "Scheduled maintenance",
      summary: "The site will be briefly unavailable.",
    }).success).toBe(true);
  });

  it("accepts long Markdown content and an explicit non-expiring value", () => {
    const result = informationAuthorInputSchema.safeParse({
      kind: "manual.announcement",
      title: "Announcement",
      summary: "A short summary",
      bodyMarkdown: "# Full announcement\n\nDetails for humans and agents.",
      expiresAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiresAt).toBeNull();
  });

  it.each(["sourceId", "audience", "credential", "status", "publishedAt", "userId"])(
    "rejects locked field %s instead of silently stripping it",
    (field) => {
      const result = informationAuthorInputSchema.safeParse({
        kind: "skill.released",
        title: "Skill v1",
        summary: "A new release",
        [field]: "tampered",
      });
      expect(result.success).toBe(false);
    },
  );
});
