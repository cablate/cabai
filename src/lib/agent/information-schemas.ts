import { z } from "zod";
import { informationKinds } from "@/lib/services/library-skill-information-domain";

export const domainActorSchema = z.object({
  type: z.enum(["user", "agent", "system"]),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200).optional(),
}).strict();

export const informationActionSchema = z.object({
  rel: z.string().min(1).max(80),
  operationId: z.string().min(1).max(200),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])),
  credential: z.enum(["none", "user"]),
}).strict();

export const informationSourceReferenceBaseSchema = z.object({
  sourceType: z.enum(["manual_announcement", "library_entry", "skill_release", "course", "api_operation"]),
  sourceId: z.string().min(1).max(200).optional(),
}).strict();

export const informationSourceReferenceSchema = informationSourceReferenceBaseSchema.superRefine((value, context) => {
  if (value.sourceType !== "manual_announcement" && !value.sourceId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceId"], message: "sourceId is required for source-backed Information" });
  }
});

export const informationAuthorInputSchema = z.object({
  kind: z.enum(informationKinds),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(600),
  whyItMatters: z.string().trim().max(1000).default(""),
  bodyMarkdown: z.string().max(100_000).default(""),
  actionSelections: z.array(z.object({
    rel: z.string().min(1).max(80),
  }).strict()).max(8).superRefine((actions, context) => {
    if (new Set(actions.map((action) => action.rel)).size !== actions.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "action rel values must be unique" });
    }
  }).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  expiresAt: z.coerce.date().nullable().optional(),
}).strict();

export const informationPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(600).optional(),
  whyItMatters: z.string().trim().max(1000).optional(),
  bodyMarkdown: z.string().max(100_000).optional(),
  actionSelections: z.array(z.object({ rel: z.string().min(1).max(80) }).strict()).max(8).superRefine((actions, context) => {
    if (new Set(actions.map((action) => action.rel)).size !== actions.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "action rel values must be unique" });
    }
  }).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  expectedRevision: z.number().int().positive(),
}).strict();

export type InformationAuthorInput = z.infer<typeof informationAuthorInputSchema>;
export type InformationPatch = z.infer<typeof informationPatchSchema>;
