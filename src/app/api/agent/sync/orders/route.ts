/** Execute an actor-owned, fresh Portaly order rebuild change set. */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { ApiError, dataResponse, parseJsonBody, withApiHandler } from "@/lib/api-route";
import { providerSyncExecuteSchema } from "@/lib/agent/provider-sync-contracts";
import { createLogger } from "@/lib/logger";
import { executeOrdersSync } from "@/lib/provider-sync-operations";

const logger = createLogger("agent-sync-orders");

export const POST = withApiHandler(
  { logger, operation: "sync orders", internalError: "Server error", includeErrorCode: true },
  async (request) => {
    const ctx = await requireAgent(request, "system:sync");
    requireDestructiveConfirmation(request);
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new ApiError({ code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key header is required", status: 400 });
    const body = await parseJsonBody(request, providerSyncExecuteSchema);
    const result = await executeOrdersSync({
      actorId: ctx.agentId,
      agentName: ctx.name,
      idempotencyKey,
      changeSetId: body.changeSetId,
      requestFingerprint: body.fingerprint,
    });
    const job = result.job;
    if (job.status === "stale") return Response.json({ error: "Change set is stale; preview again", data: { job, replayed: result.replayed } }, { status: 409 });
    return dataResponse({ job, replayed: result.replayed }, ["queued", "running"].includes(job.status) ? 202 : 200);
  },
);
