import { z } from "zod";
import {
  informationAuthorInputSchema,
  informationPatchSchema,
  informationSourceReferenceBaseSchema,
} from "./information-schemas";
import { informationKinds } from "@/lib/services/library-skill-information-domain";

export const libraryEntryPathSchema = z.object({ id: z.string().min(1).max(200) }).strict();
export const skillPathSchema = z.object({ id: z.string().min(1).max(200) }).strict();
export const skillReleasePathSchema = z.object({ releaseId: z.string().min(1).max(200) }).strict();
export const informationPathSchema = z.object({ id: z.string().min(1).max(200) }).strict();

export const expectedRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export const libraryBundlePublishSchema = z.object({
  libraryId: z.string().min(1).max(200),
  informationId: z.string().min(1).max(200),
  expectedLibraryRevision: z.number().int().positive(),
  expectedInformationRevision: z.number().int().positive(),
}).strict();

export const skillBundlePublishSchema = z.object({
  skillId: z.string().min(1).max(200),
  releaseId: z.string().min(1).max(200),
  informationId: z.string().min(1).max(200),
  expectedSkillRevision: z.number().int().positive(),
  expectedReleaseRevision: z.number().int().positive(),
  expectedInformationRevision: z.number().int().positive(),
}).strict();

export const informationCreateSchema = informationSourceReferenceBaseSchema
  .merge(informationAuthorInputSchema)
  .strict()
  .superRefine((value, context) => {
    if (value.sourceType !== "manual_announcement" && !value.sourceId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceId"], message: "sourceId is required for source-backed Information" });
    }
  });

export const informationUpdateSchema = informationPatchSchema;
export const informationSourceDraftSchema = informationSourceReferenceBaseSchema
  .extend({ kind: z.enum(informationKinds).optional() })
  .superRefine((value, context) => {
    if (value.sourceType !== "manual_announcement" && !value.sourceId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceId"], message: "sourceId is required for source-backed Information" });
    }
  });

export const informationListQuerySchema = z.object({
  status: z.enum(["draft", "published", "withdrawn"]).optional(),
  sourceType: z.enum(["manual_announcement", "library_entry", "skill_release", "course", "api_operation"]).optional(),
  sourceId: z.string().min(1).max(200).optional(),
}).strict().refine(
  (query) => query.sourceId === undefined || query.sourceType !== undefined,
  { message: "sourceType is required when sourceId is provided", path: ["sourceType"] },
);

export const informationTransitionSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();
