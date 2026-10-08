/** Read back the actor-scoped durable result of an agent provider sync. */
import { requireAgent } from "@/lib/agent-auth";
import { ApiError, dataResponse, parsePathParams, withApiHandler } from "@/lib/api-route";
import { providerSyncJobPathSchema } from "@/lib/agent/provider-sync-contracts";
import { createLogger } from "@/lib/logger";
import { readProviderSyncJob } from "@/lib/provider-sync-ledger";

const logger = createLogger("agent-sync-job-readback");

const handleGet = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "read provider sync job", internalError: "Server error", includeErrorCode: true },
  async (request, context) => {
    const ctx = await requireAgent(request, "system:read");
    const { id } = await parsePathParams(context!, providerSyncJobPathSchema);
    const job = await readProviderSyncJob(id, ctx.agentId);
    if (!job) throw new ApiError({ code: "NOT_FOUND", message: "Provider sync job not found", status: 404 });
    return dataResponse({ job });
  },
);

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGet(request, context);
}
