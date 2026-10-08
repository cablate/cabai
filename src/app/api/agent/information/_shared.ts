import type { z } from "zod";
import type { informationCreateSchema } from "@/lib/agent/admin-domain-schemas";
import type { AgentInformationItem } from "@/lib/db/schema";

type InformationCreateInput = z.infer<typeof informationCreateSchema>;

function normalizedDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value).toISOString();
}

export function matchesInformationCreate(item: AgentInformationItem, input: InformationCreateInput): boolean {
  return item.sourceType === input.sourceType
    && (input.sourceType === "manual_announcement" || item.sourceId === input.sourceId)
    && item.kind === input.kind
    && item.title === input.title
    && item.summary === input.summary
    && item.whyItMatters === input.whyItMatters
    && item.bodyMarkdown === input.bodyMarkdown
    && item.tags.length === input.tags.length
    && item.tags.every((tag, index) => tag === input.tags[index])
    && item.actions.length === input.actionSelections.length
    && item.actions.every((action, index) => action.rel === input.actionSelections[index]?.rel)
    && normalizedDate(item.expiresAt) === normalizedDate(input.expiresAt);
}

export function informationAuthorInput(input: InformationCreateInput) {
  return {
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    whyItMatters: input.whyItMatters,
    bodyMarkdown: input.bodyMarkdown,
    actionSelections: input.actionSelections,
    tags: input.tags,
    expiresAt: input.expiresAt,
  };
}
