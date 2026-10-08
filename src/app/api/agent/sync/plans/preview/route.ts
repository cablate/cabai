/** Preview provider-authoritative plan fields without mutating local plans. */
import { requireAgent } from "@/lib/agent-auth";
import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createPlanSyncChangeSet } from "@/lib/provider-sync-plans";

const logger = createLogger("agent-sync-plans-preview");

export const POST = withApiHandler(
  { logger, operation: "preview plan sync", internalError: "Server error", includeErrorCode: true },
  async (request) => {
    const ctx = await requireAgent(request, "system:sync");
    return dataResponse(await createPlanSyncChangeSet(ctx.agentId));
  },
);
