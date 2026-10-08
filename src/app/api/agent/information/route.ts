import { requireAgent } from "@/lib/agent-auth";
import { informationCreateSchema, informationListQuerySchema } from "@/lib/agent/admin-domain-schemas";
import { createWithIdempotency, deriveIdempotentResourceId, requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { dataResponse, parseJsonBody, parseQuery, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createInformationDraftFromSource, getInformation, listInformation } from "@/lib/services/information-service";
import { informationAuthorInput, matchesInformationCreate } from "./_shared";

const logger = createLogger("agent/information");

export const GET = withApiHandler(
  { logger, operation: "list information" },
  async (request) => {
    await requireAgent(request, "information:read");
    return domainResultResponse(await listInformation(parseQuery(request, informationListQuerySchema)));
  },
);

export const POST = withApiHandler(
  { logger, operation: "create information" },
  async (request) => {
    const agent = await requireAgent(request, "information:write");
    const input = await parseJsonBody(request, informationCreateSchema, { includeDetails: true });
    const idempotencyKey = requireIdempotencyKey(request);
    const resourceId = deriveIdempotentResourceId({ actorId: agent.agentId, operationId: "createInformation", idempotencyKey });
    const result = await createWithIdempotency({
      load: () => getInformation(resourceId),
      create: () => createInformationDraftFromSource({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        author: informationAuthorInput(input),
        resourceId,
      }),
      matches: (item) => matchesInformationCreate(item, input),
    });
    if (!result.ok) return domainResultResponse(result);
    return dataResponse(result.value.resource, result.value.replayed ? 200 : 201);
  },
);
