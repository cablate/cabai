import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { cleanupAgentMedia } from "@/lib/services/agent-operations-service";
import { mediaCleanupSchema } from "@/lib/agent/operations-schemas";

const logger = createLogger("agent/media/cleanup-orphans");
export const POST = withApiHandler({ logger, operation: "cleanup orphaned media" }, async (request) => {
  const actor = await requireAgent(request, "media:delete");
  requireDestructiveConfirmation(request);
  const parsed = mediaCleanupSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const result = await cleanupAgentMedia({ dryRun: parsed.data.dryRun ?? false, actor });
  if (!result.dryRun) {
    const cleanupResult = { ...result };
    Reflect.deleteProperty(cleanupResult, "dryRun");
    logger.info("Media cleanup completed via agent", { agentId: actor.agentId, ...cleanupResult });
  }
  return Response.json({ data: result });
});
