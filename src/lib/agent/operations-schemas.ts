import { z } from "zod";
import { uploadSignedUrlRequestSchema } from "../upload-types";

export const adminOperationSignalIds = [
  "deadWebhookDeliveries",
  "deadEntitlementTransitions",
  "orphanedMedia",
  "oldPendingOrders",
  "draftCourses",
  "draftLibraryEntries",
  "draftSkills",
  "draftInformation",
  "incompleteActivePlans",
] as const;
export type AdminOperationSignalId = typeof adminOperationSignalIds[number];

export const adminOperationSignalLabels: Record<AdminOperationSignalId, string> = {
  deadWebhookDeliveries: "Webhook dead-letter",
  deadEntitlementTransitions: "權限交付 dead-letter",
  orphanedMedia: "待處理媒體",
  oldPendingOrders: "逾時訂單",
  draftCourses: "課程草稿",
  draftLibraryEntries: "Library 草稿",
  draftSkills: "Skill 草稿",
  draftInformation: "Information 草稿",
  incompleteActivePlans: "未完成的上架商品設定",
};

const adminOperationItemResponseSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  count: z.number().int().nonnegative().nullable(),
  href: z.string(),
  tone: z.enum(["critical", "warning", "work"]),
});
export const adminOperationsOverviewResponseSchema = z.object({
  urgent: z.array(adminOperationItemResponseSchema),
  work: z.array(adminOperationItemResponseSchema),
  total: z.number().int().nonnegative().nullable(),
  status: z.enum(["ok", "degraded"]),
  completeness: z.enum(["complete", "partial"]),
  unavailableSignals: z.array(z.enum(adminOperationSignalIds)),
  observedAt: z.string().datetime(),
});

export const grantCreateSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});
export const grantRevokeSchema = z.object({ purchaseId: z.string().min(1) });
export const grantListQuerySchema = z.object({ userId: z.string().min(1) });

export const agentLimitSchema = z.coerce.number().int().min(1).max(200).optional();
export const memberListQuerySchema = z.object({
  planId: z.string().optional(),
  limit: agentLimitSchema,
});
export const orderListQuerySchema = z.object({
  status: z.string().optional(),
  planId: z.string().optional(),
  limit: agentLimitSchema,
  stats: z.enum(["true", "false"]).optional(),
});

export const mediaStatusSchema = z.enum(["pending", "confirmed", "orphaned", "deleted"]);
export const mediaContextSchema = uploadSignedUrlRequestSchema.shape.context;
export const mediaListQuerySchema = z.object({
  limit: agentLimitSchema,
  offset: z.coerce.number().int().min(0).optional(),
  status: mediaStatusSchema.optional(),
  context: mediaContextSchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});
export const mediaCleanupSchema = z.object({ dryRun: z.boolean().optional() });

export const webhookStatusSchema = z.enum(["pending", "processing", "sent", "failed", "dead_letter"]);
export const webhookListQuerySchema = z.object({
  status: webhookStatusSchema.optional(),
  limit: agentLimitSchema,
});
export const webhookRetrySchema = z.object({ logId: z.string().min(1) });
export const webhookRetryResponseSchema = z.object({
  requeued: z.literal(true),
  logId: z.string(),
  eventType: z.string(),
  auditId: z.string(),
  replayed: z.boolean(),
});

export const userCourseContentQuerySchema = z.object({
  lesson_id: z.string().min(1).optional(),
});
