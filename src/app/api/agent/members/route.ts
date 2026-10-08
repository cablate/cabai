import { requireAgent, parseAgentLimit } from "@/lib/agent-auth";
import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listAgentMembers } from "@/lib/services/agent-operations-service";

const logger = createLogger("agent/members");
export const GET = withApiHandler({ logger, operation: "list members", internalError: "Server error" }, async (request) => {
  const actor = await requireAgent(request, "members:read");
  const url = new URL(request.url);
  return dataResponse(await listAgentMembers({ planId: url.searchParams.get("planId"), limit: parseAgentLimit(url.searchParams.get("limit")), actor }));
});
