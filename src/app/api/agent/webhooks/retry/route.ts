import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { retryAgentWebhook } from "@/lib/services/agent-operations-service";
import { webhookRetrySchema } from "@/lib/agent/operations-schemas";

const logger = createLogger("agent-webhooks-retry");
export const POST = withApiHandler({ logger, operation: "retry webhook", internalError: "Server error" }, async (request) => {
  const actor = await requireAgent(request, "webhooks:retry");
  const parsed = webhookRetrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  requireDestructiveConfirmation(request, parsed.data.logId);
  const idempotencyKey = requireIdempotencyKey(request);
  const result = await retryAgentWebhook(parsed.data.logId, actor, idempotencyKey);
  if (result?.kind === "conflict") {
    return Response.json({ error: "Idempotency-Key was already used with a different retry request" }, { status: 409 });
  }
  if (!result) return Response.json({ error: "Webhook log not found, or not in dead_letter / failed state (already sent or pending?)" }, { status: 404 });
  if (!result.replayed) {
    logger.info("Webhook re-queued for retry", { agentId: actor.agentId, logId: parsed.data.logId, eventType: result.data.eventType });
  }
  return Response.json({ data: { requeued: true, logId: parsed.data.logId, eventType: result.data.eventType, auditId: result.data.auditId, replayed: result.replayed } });
});
