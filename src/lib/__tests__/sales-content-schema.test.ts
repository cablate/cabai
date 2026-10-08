import { describe, it, expect } from "vitest";
import { salesContentSchema, metadataJsonSchema } from "@/lib/validations/plan-presentations";

// ─── salesContentSchema: new fields ───

describe("salesContentSchema / new fields", () => {
  describe("notForItems", () => {
    it("accepts a string array", () => {
      const result = salesContentSchema.safeParse({
        notForItems: ["完全沒寫過程式的人", "只想看理論的人"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts an empty array", () => {
      const result = salesContentSchema.safeParse({ notForItems: [] });
      expect(result.success).toBe(true);
    });

    it("rejects non-array", () => {
      const result = salesContentSchema.safeParse({ notForItems: "not an array" });
      expect(result.success).toBe(false);
    });

    it("rejects array with empty strings", () => {
      const result = salesContentSchema.safeParse({ notForItems: [""] });
      expect(result.success).toBe(false);
    });
  });

  describe("firstWeekPlan", () => {
    it("accepts a markdown string", () => {
      const result = salesContentSchema.safeParse({
        firstWeekPlan: "**Day 1** 安裝與設定\n**Day 2-3** 完成前 4 堂課",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      const result = salesContentSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects string over 2000 characters", () => {
      const result = salesContentSchema.safeParse({
        firstWeekPlan: "x".repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it("accepts string exactly 2000 characters", () => {
      const result = salesContentSchema.safeParse({
        firstWeekPlan: "x".repeat(2000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("vsFreeContent", () => {
    it("accepts a markdown string", () => {
      const result = salesContentSchema.safeParse({
        vsFreeContent: "免費手冊幫你理解概念，這門課帶你實作。",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      const result = salesContentSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects string over 2000 characters", () => {
      const result = salesContentSchema.safeParse({
        vsFreeContent: "x".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("heroSummary", () => {
    it("accepts up to 3 short strings", () => {
      const result = salesContentSchema.safeParse({
        heroSummary: ["適合開發者", "學會 Claude Code", "7 天完成實作"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts 1 item", () => {
      const result = salesContentSchema.safeParse({
        heroSummary: ["適合開發者"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects 4 items", () => {
      const result = salesContentSchema.safeParse({
        heroSummary: ["A", "B", "C", "D"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects string over 200 characters", () => {
      const result = salesContentSchema.safeParse({
        heroSummary: ["x".repeat(201)],
      });
      expect(result.success).toBe(false);
    });

    it("accepts undefined (optional)", () => {
      const result = salesContentSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("all new fields together", () => {
    it("accepts the full combo", () => {
      const result = salesContentSchema.safeParse({
        notForItems: ["初學者"],
        firstWeekPlan: "Day 1 開始",
        vsFreeContent: "差異在這裡",
        heroSummary: ["A", "B", "C"],
        urgencyNote: "限時優惠",
        audienceItems: ["開發者"],
        painPoints: ["寫 prompt 品質不穩"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object (all optional)", () => {
      const result = salesContentSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});

// ─── metadataJsonSchema (discriminated union) ───

describe("salesContentSchema / testimonials", () => {
  const validTestimonial = {
    name: "Alice Chen",
    title: "全端工程師",
    avatarUrl: "https://example.com/avatar.jpg",
    content: "課程內容非常清楚，實作範例很實用",
    rating: 5,
  };

  it("accepts a full testimonial with all fields", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [validTestimonial],
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimum fields (name + content)", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Bob", content: "很實用的課程" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty array (optional)", () => {
    const result = salesContentSchema.safeParse({ testimonials: [] });
    expect(result.success).toBe(true);
  });

  it("accepts undefined (optional)", () => {
    const result = salesContentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ content: "好課" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing content", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects content over 1000 characters", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "x".repeat(1001) }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts content exactly 1000 characters", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "x".repeat(1000) }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects rating less than 1", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "好課", rating: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects rating greater than 5", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "好課", rating: 6 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects rating as float", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "好課", rating: 4.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatarUrl", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "好課", avatarUrl: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name string", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "", content: "好課" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content string", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", content: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 80 characters", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "x".repeat(81), content: "好課" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects title over 120 characters", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [{ name: "Alice", title: "x".repeat(121), content: "好課" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple testimonials simultaneously", () => {
    const result = salesContentSchema.safeParse({
      testimonials: [
        { name: "Alice", content: "讚" },
        { name: "Bob", title: "PM", content: "實用" },
        {
          name: "Charlie",
          content: "學到很多",
          rating: 4,
          avatarUrl: "https://example.com/avatar.jpg",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("allows testimonials alongside other sales content fields", () => {
    const result = salesContentSchema.safeParse({
      audienceItems: ["開發者"],
      painPoints: ["寫 prompt 不穩"],
      testimonials: [{ name: "Alice", content: "課程很棒" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("metadataJsonSchema / new fields in type-specific metadata", () => {
  it("accepts notForItems in course metadata", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "course",
      metadata: {
        notForItems: ["完全初學者"],
        heroSummary: ["A", "B"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts firstWeekPlan in download metadata", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "download",
      metadata: {
        fileFormat: "PDF",
        fileSize: "10 MB",
        firstWeekPlan: "下載後先看第一章",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects heroSummary with 4 items in course metadata", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "course",
      metadata: {
        heroSummary: ["A", "B", "C", "D"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("allows metadata without sales content fields (backward compat)", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "download",
      metadata: {
        fileFormat: "PDF",
        fileSize: "5 MB",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects vsFreeContent over 2000 chars in service metadata", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "service",
      metadata: {
        serviceScope: "Consulting",
        expectedTimelineWeeks: 4,
        vsFreeContent: "x".repeat(2001),
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts testimonials in course metadata (merged schema)", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "course",
      metadata: {
        chapterCount: 10,
        lessonCount: 32,
        testimonials: [
          { name: "Alice", content: "課程內容超清楚" },
          { name: "Bob", title: "PM", content: "實作範例很實用", rating: 5 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid testimonial in course metadata", () => {
    const result = metadataJsonSchema.safeParse({
      offeringType: "course",
      metadata: {
        testimonials: [{ name: "", content: "" }],
      },
    });
    expect(result.success).toBe(false);
  });
});
