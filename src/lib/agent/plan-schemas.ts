import { z } from "zod";
import { trustBlockSchema } from "@/lib/validations/plan-presentations";

export const planCreateSchema = z.object({
  id: z.string().trim().min(1).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "id must match ^[A-Za-z0-9][A-Za-z0-9_-]*$")
    .optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  amount: z.number().int().min(0),
  currency: z.string().min(3).max(8).default("TWD"),
  billingPeriod: z.enum(["monthly", "yearly", "one-time"]),
  pricingType: z.enum(["fixed", "dynamic"]).default("fixed"),
  status: z.enum(["active", "inactive"]).default("active"),
  purchaseButtonMode: z.enum(["internal", "external", "disabled", "free_claim"]).default("internal"),
  slug: z.string().optional().nullable(),
  hasPlatformContent: z.boolean().default(false),
  hasExternalService: z.boolean().default(false),
  image: z.string().url().optional().nullable(),
});

export const planUpdateSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  image: z.string().url().optional().nullable(),
  merchantPlanId: z.string().optional().nullable(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  slug: z.string().nullable().optional(),
});

export const planCourseBindSchema = z.object({ courseId: z.string().min(1) });

export const planContentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(["video", "pdf", "text", "download"]),
  content: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export const planContentUpdateSchema = planContentCreateSchema.partial();

export const planServiceCreateSchema = z.object({
  serviceName: z.string().min(1)
    .regex(/^[a-z0-9-]+$/, "serviceName must be lowercase alphanumeric with hyphens"),
  webhookUrl: z.string().url(),
  identityField: z.string().optional(),
  configJson: z.string().optional(),
});

export const planServiceUpdateSchema = z.object({
  webhookUrl: z.string().url().optional(),
  identityField: z.string().optional(),
  configJson: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const planPresentationUpdateSchema = z.object({
  offeringType: z.enum(["course", "lecture", "free_event", "offline_event", "service", "membership", "download"]).optional(),
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(300).optional().nullable(),
  description: z.string().optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  bannerImage: z.string().url().optional().nullable(),
  ctaLabel: z.string().max(50).optional().nullable(),
  metadataJson: z.record(z.unknown()).optional().nullable(),
  trustNotesJson: z.array(trustBlockSchema).optional().nullable(),
  isFeatured: z.boolean().optional(),
  featuredSortOrder: z.number().int().optional().nullable(),
});

export const planIdPathSchema = z.object({ id: z.string().min(1) });
export const planCoursePathSchema = planIdPathSchema.extend({ courseId: z.string().min(1) });
export const planContentPathSchema = planIdPathSchema.extend({ contentId: z.string().min(1) });
export const planServicePathSchema = planIdPathSchema.extend({ serviceId: z.string().min(1) });
export const includeDeletedQuerySchema = z.object({
  includeDeleted: z.enum(["true", "false"]).optional(),
});
