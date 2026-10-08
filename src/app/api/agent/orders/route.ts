import { requireAgent, parseAgentLimit } from "@/lib/agent-auth";
import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listAgentOrders } from "@/lib/services/agent-operations-service";

const logger = createLogger("agent/orders");
export const GET = withApiHandler({ logger, operation: "list orders", internalError: "Server error" }, async (request) => {
  const actor = await requireAgent(request, "orders:read");
  const url = new URL(request.url);
  return dataResponse(await listAgentOrders({ status: url.searchParams.get("status"), planId: url.searchParams.get("planId"), limit: parseAgentLimit(url.searchParams.get("limit")), statsOnly: url.searchParams.get("stats") === "true", actor }));
});
