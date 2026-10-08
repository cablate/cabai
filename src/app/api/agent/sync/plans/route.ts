/** Execute a fresh, agent-reviewed Portaly plan change set. */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { ApiError, dataResponse, parseJsonBody, withApiHandler } from "@/lib/api-route";
import { providerSyncExecuteSchema } from "@/lib/agent/provider-sync-contracts";
import { createLogger } from "@/lib/logger";
import { executePlanSync } from "@/lib/provider-sync-plans";

const logger = createLogger("agent-sync-plans");

export const POST = withApiHandler(
  { logger, operation: "sync plans", internalError: "Server error", includeErrorCode: true },
  async (request) => {
    const ctx = await requireAgent(request, "system:sync");
    requireDestructiveConfirmation(request);
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      throw new ApiError({ code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key header is required", status: 400 });
    }
    const body = await parseJsonBody(request, providerSyncExecuteSchema);
    const result = await executePlanSync({
      actorId: ctx.agentId,
      agentName: ctx.name,
      idempotencyKey,
      changeSetId: body.changeSetId,
      requestFingerprint: body.fingerprint,
    });
    const job = result.job;
    if (job.status === "stale") {
      return Response.json({ error: "Change set is stale; preview again", data: { job, replayed: result.replayed } }, { status: 409 });
    }
    logger.info("Plan sync job read-back", { agentId: ctx.agentId, jobId: job.id, status: job.status });
    return dataResponse({ job, replayed: result.replayed }, ["queued", "running"].includes(job.status) ? 202 : 200);
  },
);
