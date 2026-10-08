import { describe, expect, it } from "vitest";
import {
  createLibraryEntrySchema,
  toLibraryPublicDetail,
  toLibraryPublicSummary,
  updateLibraryEntrySchema,
  validateLibraryEntryContent,
  type LibraryEntry,
} from "./library-service";

const row: LibraryEntry = {
  id: "library-1",
  slug: "safe-entry",
  title: "Safe entry",
  summary: "A concise summary",
  bodyMarkdown: "Read [the guide](https://example.com/a.pdf).",
  tags: ["guide"],
  featured: true,
  status: "published",
  revision: 2,
  publishedAt: new Date("2026-07-16T00:00:00.000Z"),
  withdrawnAt: null,
  createdAt: new Date("2026-07-15T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
};

describe("Library service boundary", () => {
  it("strictly accepts authorable create and update fields only", () => {
    expect(createLibraryEntrySchema.safeParse({
      slug: "entry",
      title: "Entry",
      summary: "Summary",
      bodyMarkdown: "Body",
      status: "published",
    }).success).toBe(false);
    expect(updateLibraryEntrySchema.safeParse({
      expectedRevision: 1,
      publishedAt: new Date(),
    }).success).toBe(false);
  });

  it("keeps unsafe drafts representable while readiness rejects them", () => {
    const result = validateLibraryEntryContent({
      ...row,
      bodyMarkdown: "<script>alert(1)</script>\n\n![x](https://example.com/x.png)",
    });
    expect(result.ready).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "unsafe_markdown_html",
      "unsafe_markdown_image",
    ]));
  });

  it("keeps bodyMarkdown out of public list projection and in public detail only", () => {
    expect(toLibraryPublicSummary(row)).not.toHaveProperty("bodyMarkdown");
    expect(toLibraryPublicSummary(row)).not.toHaveProperty("status");
    expect(toLibraryPublicDetail(row).bodyMarkdown).toBe(row.bodyMarkdown);
  });
});
