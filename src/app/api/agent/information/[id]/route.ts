import { requireAgent } from "@/lib/agent-auth";
import { informationPathSchema, informationUpdateSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getInformation, updateInformationDraft } from "@/lib/services/information-service";

const logger = createLogger("agent/information/detail");
type RouteContext = { params: Promise<{ id: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get information" },
  async (request, context) => {
    await requireAgent(request, "information:read");
    const { id } = await parsePathParams(context!, informationPathSchema);
    return domainResultResponse(await getInformation(id));
  },
);

const handlePatch = withApiHandler<RouteContext>(
  { logger, operation: "update information" },
  async (request, context) => {
    await requireAgent(request, "information:write");
    const { id } = await parsePathParams(context!, informationPathSchema);
    const input = await parseJsonBody(request, informationUpdateSchema, { includeDetails: true });
    return domainResultResponse(await updateInformationDraft(id, input));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return handlePatch(request, context);
}
