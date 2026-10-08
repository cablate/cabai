/** Read provider state and persist an actor-bound subscription change set. */
import { requireAgent } from "@/lib/agent-auth";
import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createSubscriptionSyncChangeSet } from "@/lib/provider-sync-operations";

const logger = createLogger("agent-sync-subscriptions-preview");

export const POST = withApiHandler(
  { logger, operation: "preview subscription sync", internalError: "Server error", includeErrorCode: true },
  async (request) => {
    const ctx = await requireAgent(request, "system:sync");
    return dataResponse(await createSubscriptionSyncChangeSet(ctx.agentId));
  },
);
