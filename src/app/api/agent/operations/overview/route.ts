import { requireAgent } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { getAdminOperationsOverview } from "@/lib/admin-operations";
import { createLogger } from "@/lib/logger";

const logger = createLogger("agent-operations-overview");

export const GET = withApiHandler(
  { logger, operation: "get operations overview", internalError: "Server error" },
  async (request) => {
    await requireAgent(request, "system:read");
    const overview = await getAdminOperationsOverview();
    return Response.json({ data: overview });
  },
);
