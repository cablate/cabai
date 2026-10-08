import { describe, expect, it, vi } from "vitest";
import {
  estimateLibraryReadingMinutes,
  hasMeaningfulLibraryUpdate,
} from "./library-article";
import { articleSchema } from "./json-ld";

vi.mock("@/lib/constants", () => ({
  BRAND_NAME: "Example Site",
  CREATOR_NAME: "Example Author",
  CREATOR_URL: "https://example.com",
}));

describe("Library article presentation", () => {
  it("estimates mixed Chinese and Latin Markdown without storing derived data", () => {
    const markdown = `# 標題\n\n${"內容".repeat(400)}\n\n[Agent API](https://example.com) reliable workflow`;
    expect(estimateLibraryReadingMinutes(markdown)).toBe(3);
    expect(estimateLibraryReadingMinutes("短文")).toBe(1);
  });

  it("suppresses publication timestamp noise but exposes later edits", () => {
    const publishedAt = new Date("2026-07-30T10:00:00.000Z");
    expect(hasMeaningfulLibraryUpdate(
      publishedAt,
      new Date("2026-07-30T10:00:00.500Z"),
    )).toBe(false);
    expect(hasMeaningfulLibraryUpdate(
      publishedAt,
      new Date("2026-07-30T10:05:00.000Z"),
    )).toBe(true);
  });

  it("builds an Article schema with one canonical identity", () => {
    const schema = articleSchema({
      headline: "Agent 資訊管道",
      description: "讓內容持續進入使用者的 AI 工作環境。",
      url: "/library/agent-information-channel",
      image: "/library/agent-information-channel/social-image",
      datePublished: new Date("2026-07-01T00:00:00.000Z"),
      dateModified: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(schema).toMatchObject({
      "@type": "Article",
      headline: "Agent 資訊管道",
      datePublished: "2026-07-01T00:00:00.000Z",
      dateModified: "2026-07-02T00:00:00.000Z",
      author: { "@type": "Person", name: "Example Author", url: "https://example.com" },
      publisher: { "@type": "Organization", name: "Example Site" },
    });
    expect(schema.url).toMatch(/\/library\/agent-information-channel$/);
    expect(schema.image[0]).toMatch(/\/library\/agent-information-channel\/social-image$/);
    expect(schema.mainEntityOfPage["@id"]).toBe(schema.url);
  });
});
