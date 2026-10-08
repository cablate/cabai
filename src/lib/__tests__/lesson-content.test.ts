import { describe, expect, it } from "vitest";
import {
  normalizeLessonContent,
  normalizeLessonResources,
  normalizeVideoUrl,
  parseLessonResources,
  serializeLessonResources,
  stripDuplicateLeadingHeading,
} from "@/lib/lesson-content";

describe("stripDuplicateLeadingHeading", () => {
  it("removes only a leading H1 that duplicates the lesson title", () => {
    expect(stripDuplicateLeadingHeading("# Lesson title\n\nBody", "Lesson title")).toBe("Body");
    expect(stripDuplicateLeadingHeading("# Different title\n\nBody", "Lesson title")).toContain("# Different title");
  });
});

describe("lesson-content helpers", () => {
  it("normalizes common YouTube URLs to embed URLs", () => {
    expect(normalizeVideoUrl("https://youtu.be/abc123?t=30s")).toBe(
      "https://www.youtube.com/embed/abc123?start=30",
    );
    expect(normalizeVideoUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
    expect(normalizeVideoUrl("https://www.youtube.com/shorts/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });

  it("normalizes main lesson video content only for video lessons", () => {
    expect(normalizeLessonContent("video", "https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
    expect(normalizeLessonContent("text", "https://youtu.be/abc123")).toBe(
      "https://youtu.be/abc123",
    );
  });

  it("filters resources without URLs and normalizes saved resources", () => {
    const resources = normalizeLessonResources([
      { id: "b", type: "download", title: "ZIP", url: "/api/assets/file", sortOrder: 2 },
      { id: "a", type: "video", title: "YT", url: "https://youtu.be/abc123", sortOrder: 1 },
      { id: "empty", type: "link", title: "", url: "https://example.com", sortOrder: 3 },
      { id: "missing-url", type: "link", title: "No URL", url: "", sortOrder: 4 },
    ]);

    expect(resources).toEqual([
      {
        id: "a",
        type: "video",
        title: "YT",
        url: "https://www.youtube.com/embed/abc123",
        sortOrder: 1,
      },
      {
        id: "b",
        type: "download",
        title: "ZIP",
        url: "/api/assets/file",
        sortOrder: 2,
      },
      {
        id: "empty",
        type: "link",
        title: "補充連結",
        url: "https://example.com",
        sortOrder: 3,
      },
    ]);
  });

  it("parses serialized resources and rewrites sort order on save", () => {
    const saved = serializeLessonResources(
      parseLessonResources(
        JSON.stringify([
          { id: "r2", type: "link", title: "Second", url: "https://b.test", sortOrder: 20 },
          { id: "r1", type: "pdf", title: "First", url: "/api/assets/pdf", sortOrder: 10 },
        ]),
      ),
    );

    expect(saved.map((resource) => resource.sortOrder)).toEqual([0, 1]);
    expect(saved.map((resource) => resource.id)).toEqual(["r1", "r2"]);
  });
});
