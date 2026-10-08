/** Restore a provider sync's local preimage only when no later writes or external delivery occurred. */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { ApiError, dataResponse, parsePathParams, withApiHandler } from "@/lib/api-route";
import { providerSyncJobPathSchema } from "@/lib/agent/provider-sync-contracts";
import { createLogger } from "@/lib/logger";
import { recoverProviderSyncJob } from "@/lib/provider-sync-recovery";

const logger = createLogger("agent-sync-recovery");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "recover provider sync", internalError: "Server error", includeErrorCode: true },
  async (request, context) => {
    const ctx = await requireAgent(request, "system:sync");
    const { id } = await parsePathParams(context!, providerSyncJobPathSchema);
    requireDestructiveConfirmation(request, id);
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new ApiError({ code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key header is required", status: 400 });
    const result = await recoverProviderSyncJob({
      jobId: id,
      actorId: ctx.agentId,
      agentName: ctx.name,
      idempotencyKey,
    });
    return dataResponse({ job: result.job, replayed: result.replayed });
  },
);

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlePost(request, context);
}
