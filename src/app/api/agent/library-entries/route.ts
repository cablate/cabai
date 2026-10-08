import { requireAgent } from "@/lib/agent-auth";
import {
  createWithIdempotency,
  deriveIdempotentResourceId,
  requireIdempotencyKey,
  sameStringArray,
} from "@/lib/agent/admin-idempotency";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import {
  createLibraryEntry,
  createLibraryEntrySchema,
  getLibraryEntry,
  listLibraryEntries,
} from "@/lib/services/library-service";
import { domainSuccess } from "@/lib/services/library-skill-information-domain";

const logger = createLogger("agent/library-entries");

export const GET = withApiHandler(
  { logger, operation: "list Library entries" },
  async (request) => {
    await requireAgent(request, "library:read");
    return domainResultResponse(await listLibraryEntries());
  },
);

export const POST = withApiHandler(
  { logger, operation: "create Library entry" },
  async (request) => {
    const agent = await requireAgent(request, "library:write");
    const input = await parseJsonBody(request, createLibraryEntrySchema, {
      includeDetails: true,
    });
    const idempotencyKey = requireIdempotencyKey(request);
    const resourceId = deriveIdempotentResourceId({
      actorId: agent.agentId,
      operationId: "createLibraryEntry",
      idempotencyKey,
    });

    const result = await createWithIdempotency({
      load: () => getLibraryEntry(resourceId),
      create: () => createLibraryEntry(input, { resourceId }),
      matches: (resource) => resource.slug === input.slug
        && resource.title === input.title
        && resource.summary === input.summary
        && resource.bodyMarkdown === input.bodyMarkdown
        && sameStringArray(resource.tags, input.tags)
        && resource.featured === input.featured,
    });

    if (!result.ok) return domainResultResponse(result);
    return domainResultResponse(
      domainSuccess(result.value.resource),
      result.value.replayed ? 200 : 201,
    );
  },
);
