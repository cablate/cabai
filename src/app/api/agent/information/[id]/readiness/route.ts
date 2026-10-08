import { requireAgent } from "@/lib/agent-auth";
import { informationPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { validateInformationReadiness } from "@/lib/services/information-service";

const logger = createLogger("agent/information/readiness");
type RouteContext = { params: Promise<{ id: string }> };

const handlePost = withApiHandler<RouteContext>(
  { logger, operation: "validate information readiness" },
  async (request, context) => {
    await requireAgent(request, "information:read");
    const { id } = await parsePathParams(context!, informationPathSchema);
    return domainResultResponse(await validateInformationReadiness(id));
  },
);

export function POST(request: Request, context: RouteContext) {
  return handlePost(request, context);
}
