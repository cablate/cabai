import { requireAgent } from "@/lib/agent-auth";
import { informationPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getInformationStats } from "@/lib/services/information-service";

const logger = createLogger("agent/information/stats");
type RouteContext = { params: Promise<{ id: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get information stats" },
  async (request, context) => {
    await requireAgent(request, "information:read");
    const { id } = await parsePathParams(context!, informationPathSchema);
    return domainResultResponse(await getInformationStats(id));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
