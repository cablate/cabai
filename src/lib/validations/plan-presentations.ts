import { z } from "zod";

// ─── Base Presentation Schema ───

export const offeringTypeEnum = z.enum([
  "course",
  "lecture",
  "free_event",
  "offline_event",
  "service",
  "membership",
  "download",
]);

export type OfferingType = z.infer<typeof offeringTypeEnum>;

// Common fields shared by all offering types
export const basePresentationSchema = z.object({
  planId: z.string().min(1, "planId is required"),
  offeringType: offeringTypeEnum,
  title: z
    .string()
    .min(1, "title is required")
    .max(256, "title must be <= 256 characters"),
  subtitle: z.string().max(256, "subtitle must be <= 256 characters").optional(),
  description: z
    .string()
    .max(5000, "description must be <= 5000 characters")
    .optional(),
  coverImage: z.string().url("coverImage must be a valid URL").optional(),
  bannerImage: z.string().url("bannerImage must be a valid URL").optional(),
  ctaLabel: z
    .string()
    .min(1, "ctaLabel is required")
    .max(100, "ctaLabel must be <= 100 characters"),
  isFeatured: z.boolean().default(false),
  featuredSortOrder: z.number().int().min(0).optional(),
  publishedAt: z.coerce.date().optional(),
});

// ─── Type-Specific Metadata Schemas ───

const stringListSchema = z.array(z.string().min(1)).optional();

export const instructorSchema = z.object({
  name: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  credentials: stringListSchema,
  avatarUrl: z.string().url().optional(),
});

export type InstructorMetadata = z.infer<typeof instructorSchema>;

export const faqItemSchema = z.object({
  q: z.string().min(1).max(200),
  a: z.string().min(1).max(1000),
});

export type FaqItemMetadata = z.infer<typeof faqItemSchema>;

export const socialProofItemSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(80),
});

export type SocialProofItemMetadata = z.infer<typeof socialProofItemSchema>;

export const testimonialItemSchema = z.object({
  name: z.string().min(1, "姓名為必填").max(80, "姓名不得超過 80 字"),
  title: z.string().max(120, "職稱不得超過 120 字").optional(),
  avatarUrl: z.string().url("頭像須為有效的 URL").optional(),
  content: z
    .string()
    .min(1, "評價內容為必填")
    .max(1000, "評價內容不得超過 1000 字"),
  rating: z
    .number()
    .int("評分須為整數")
    .min(1, "評分最低 1 星")
    .max(5, "評分最高 5 星")
    .optional(),
});

export type TestimonialItem = z.infer<typeof testimonialItemSchema>;

/**
 * Shared editable sales-page content.
 *
 * Stored inside metadataJson so admins can update the public detail page
 * without changing payment/source-of-truth data from Portaly.
 */
export const salesContentSchema = z.object({
  audienceItems: stringListSchema,
  painPoints: stringListSchema,
  learningObjectives: stringListSchema,
  includedItems: stringListSchema,
  outcomes: stringListSchema,
  prerequisites: stringListSchema,
  /** 不適合誰 — 降低誤購與錯誤期待 */
  notForItems: stringListSchema,
  /** 買完後 7 天怎麼開始 (markdown, e.g. Day 1 / Day 2-3 / Day 4-7) */
  firstWeekPlan: z.string().max(2000).optional(),
  /** 跟免費內容的差異說明 (markdown) */
  vsFreeContent: z.string().max(2000).optional(),
  /** 首屏三句話摘要：適合誰、解決什麼、7天後會完成什麼 */
  heroSummary: z.array(z.string().max(200)).max(3).optional(),
  urgencyNote: z.string().max(300).optional(),
  instructor: instructorSchema.optional(),
  faqItems: z.array(faqItemSchema).optional(),
  socialProofItems: z.array(socialProofItemSchema).optional(),
  testimonials: z.array(testimonialItemSchema).optional(),
});

export type SalesContentMetadata = z.infer<typeof salesContentSchema>;

// Course: chapters, duration, preview summary
export const courseMetadataSchema = z
  .object({
    chapterCount: z.number().int().min(1).optional(),
    lessonCount: z.number().int().min(1).optional(),
    estimatedHours: z.number().min(0.5).optional(),
    freeLessonCount: z.number().int().min(0).optional(),
    language: z.string().default("zh-TW"),
  })
  .merge(salesContentSchema);

export type CourseMetadata = z.infer<typeof courseMetadataSchema>;

// Lecture: speaker, date, time, agenda, replay info
export const lectureMetadataSchema = z
  .object({
    speaker: z.string().min(1, "speaker is required"),
    speakerBio: z.string().max(500).optional(),
    eventDate: z.coerce.date(),
    eventTime: z.string().regex(/^\d{2}:\d{2}$/, "format HH:MM"),
    durationMinutes: z.number().int().min(15),
    hasReplay: z.boolean().default(false),
    agenda: z
      .array(
        z.object({
          time: z.string().regex(/^\d{2}:\d{2}$/),
          topic: z.string().min(1),
        })
      )
      .optional(),
    registrationDeadline: z.coerce.date().optional(),
  })
  .merge(salesContentSchema);

export type LectureMetadata = z.infer<typeof lectureMetadataSchema>;

// Free event: capacity, registration notes, target audience
export const freeEventMetadataSchema = z
  .object({
    eventDate: z.coerce.date(),
    capacity: z.number().int().min(1).optional(),
    targetAudience: z.string().max(500).optional(),
    registrationNotes: z.string().max(500).optional(),
    reminderEmail: z.boolean().default(true),
  })
  .merge(salesContentSchema);

export type FreeEventMetadata = z.infer<typeof freeEventMetadataSchema>;

// Offline event: venue, address, ticket tiers, admission notes
export const offlineEventMetadataSchema = z
  .object({
    eventDate: z.coerce.date(),
    eventTime: z.string().regex(/^\d{2}:\d{2}$/),
    venue: z.string().min(1, "venue is required"),
    address: z.string().min(1, "address is required"),
    capacity: z.number().int().min(1),
    admissionNotes: z.string().max(500).optional(),
    parkingInfo: z.string().max(200).optional(),
    dressCode: z.string().max(200).optional(),
    ticketTiers: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          quantity: z.number().int().min(1),
        })
      )
      .optional(),
  })
  .merge(salesContentSchema);

export type OfflineEventMetadata = z.infer<typeof offlineEventMetadataSchema>;

// Service: deliverables, timeline, required inputs
export const serviceMetadataSchema = z
  .object({
    serviceScope: z.string().min(1, "serviceScope is required"),
    expectedTimelineWeeks: z.number().int().min(1),
    requiredInputs: z.array(z.string()).optional(),
    deliverySteps: z
      .array(
        z.object({
          step: z.number().int().min(1),
          title: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .optional(),
    supportChannels: z
      .array(z.enum(["email", "slack", "discord", "phone"]))
      .optional(),
  })
  .merge(salesContentSchema);

export type ServiceMetadata = z.infer<typeof serviceMetadataSchema>;

// Membership: benefits, update frequency, monthly content
export const membershipMetadataSchema = z
  .object({
    benefits: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .min(1, "at least one benefit required"),
    updateFrequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
    monthlyContentCount: z.number().int().min(1).optional(),
    exclusiveChannelAccess: z.boolean().default(false),
    communityEvents: z.boolean().default(false),
  })
  .merge(salesContentSchema);

export type MembershipMetadata = z.infer<typeof membershipMetadataSchema>;

// Download: file format, size, license
export const downloadMetadataSchema = z
  .object({
    fileFormat: z.string().min(1),
    fileSize: z.string().min(1), // e.g., "150 MB"
    license: z.enum(["personal", "commercial", "educational"]).optional(),
    numberOfFiles: z.number().int().min(1).optional(),
  })
  .merge(salesContentSchema);

export type DownloadMetadata = z.infer<typeof downloadMetadataSchema>;

// ─── Discriminated Union For Type-Specific Metadata ───

export const metadataJsonSchema = z.discriminatedUnion("offeringType", [
  z.object({
    offeringType: z.literal("course"),
    metadata: courseMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("lecture"),
    metadata: lectureMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("free_event"),
    metadata: freeEventMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("offline_event"),
    metadata: offlineEventMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("service"),
    metadata: serviceMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("membership"),
    metadata: membershipMetadataSchema.optional(),
  }),
  z.object({
    offeringType: z.literal("download"),
    metadata: downloadMetadataSchema.optional(),
  }),
]);

// ─── Trust Notes Schema ───

export const trustBlockSchema = z.object({
  type: z.enum(["refund-policy", "faq", "testimonial", "guarantee", "custom"]),
  title: z.string().min(1),
  content: z.string().min(1),
  icon: z.string().optional(), // icon name or URL
});

export type TrustBlock = z.infer<typeof trustBlockSchema>;

export const trustNotesJsonSchema = z
  .array(trustBlockSchema)
  .optional();

export type TrustNotesJson = z.infer<typeof trustNotesJsonSchema>;

// ─── Full Presentation Input Schema (for create / update) ───

export const createPlanPresentationSchema = basePresentationSchema.extend({
  metadataJson: metadataJsonSchema.optional(),
  trustNotesJson: trustNotesJsonSchema.optional(),
});

export const updatePlanPresentationSchema = basePresentationSchema.extend({
  metadataJson: metadataJsonSchema.optional(),
  trustNotesJson: trustNotesJsonSchema.optional(),
}).partial();

// Inferred types
export type CreatePlanPresentationInput = z.infer<
  typeof createPlanPresentationSchema
>;
export type UpdatePlanPresentationInput = z.infer<
  typeof updatePlanPresentationSchema
>;
export type PlanPresentationData = CreatePlanPresentationInput;
