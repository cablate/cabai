/** Read provider state and persist an actor-bound order change set. */
import { requireAgent } from "@/lib/agent-auth";
import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createOrdersSyncChangeSet } from "@/lib/provider-sync-operations";

const logger = createLogger("agent-sync-orders-preview");

export const POST = withApiHandler(
  { logger, operation: "preview order sync", internalError: "Server error", includeErrorCode: true },
  async (request) => {
    const ctx = await requireAgent(request, "system:sync");
    return dataResponse(await createOrdersSyncChangeSet(ctx.agentId));
  },
);
