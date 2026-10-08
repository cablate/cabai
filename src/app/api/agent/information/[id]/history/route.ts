import { requireAgent } from "@/lib/agent-auth";
import { informationPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { dataResponse, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getInformation, getInformationHistory } from "@/lib/services/information-service";

const logger = createLogger("agent/information/history");
type RouteContext = { params: Promise<{ id: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get information history" },
  async (request, context) => {
    await requireAgent(request, "information:read");
    const { id } = await parsePathParams(context!, informationPathSchema);
    const information = await getInformation(id);
    if (!information.ok) return domainResultResponse(information);
    return dataResponse(await getInformationHistory(id));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
