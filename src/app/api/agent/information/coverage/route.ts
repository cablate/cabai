import { requireAgent } from "@/lib/agent-auth";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getInformationCoverage } from "@/lib/services/information-service";

const logger = createLogger("agent/information/coverage");

export const GET = withApiHandler(
  { logger, operation: "get information coverage" },
  async (request) => {
    await requireAgent(request, "information:read");
    return domainResultResponse(await getInformationCoverage());
  },
);
