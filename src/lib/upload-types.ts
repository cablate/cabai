import { z } from "zod";

export const uploadSignedUrlRequestSchema = z.object({
  filename: z.string().min(1).max(256),
  contentType: z.string().min(1),
  fileSize: z.number().int().min(1),
  context: z.enum([
    "plan-cover",
    "plan-banner",
    "course-image",
    "lesson-thumbnail",
    "lesson-content",
    "service-guide",
    "skill-artifact",
  ]),
});

export type UploadSignedUrlRequest = z.infer<
  typeof uploadSignedUrlRequestSchema
>;

export const uploadConfirmRequestSchema = z.object({
  storageKey: z.string().min(1),
  entityType: z.enum(["lesson", "planContent", "course", "plan", "planPresentation", "skillRelease"]).optional(),
  entityId: z.string().min(1).optional(),
  expectedEntityRevision: z.number().int().positive().optional(),
}).refine(
  (value) => (value.entityType && value.entityId) || (!value.entityType && !value.entityId),
  { message: "entityType and entityId must be provided together" },
).refine(
  (value) => value.entityType !== "skillRelease" || value.expectedEntityRevision !== undefined,
  { message: "expectedEntityRevision is required for a Skill release artifact" },
);

export type UploadConfirmRequest = z.infer<typeof uploadConfirmRequestSchema>;

export const uploadSignedUrlResponseSchema = z.object({
  signedUrl: z.string().url(),
  mediaId: z.string(),
  assetUrl: z.string().min(1),
  publicUrl: z.string().min(1),
  storageKey: z.string(),
  expiresIn: z.number(), // seconds
});

export type UploadSignedUrlResponse = z.infer<
  typeof uploadSignedUrlResponseSchema
>;

export type UploadError = {
  code:
    | "UNAUTHORIZED"
    | "INVALID_FILE"
    | "FILE_TOO_LARGE"
    | "INVALID_TYPE"
    | "RATE_LIMIT"
    | "SERVER_ERROR";
  message: string;
  field?: string;
};
