/**
 * POST /api/agent/plans/[id]/services/[serviceId]/restore
 *
 * Restore a soft-deleted service config (clears deletedAt + deletedBy).
 * Does NOT require destructive confirm — non-destructive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { restoreAgentPlanService } from "@/lib/services/agent-plan-service";

const logger = createLogger("agent/plans/services/restore");

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  try {
    const agent = await requireAgent(request, "service:write");
    const { id: planId, serviceId } = await params;

    const result = await restoreAgentPlanService(planId, serviceId, agent);
    if (result.kind === "not-found") {
      return Response.json(
        { error: "Service config not found or not deleted" },
        { status: 404 },
      );
    }

    return Response.json({ data: { restored: true, serviceId, planId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to restore service config", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type ServiceRouteContext = { params: Promise<{ id: string; serviceId: string }> };
const restoreService = withApiHandler<ServiceRouteContext>(
  { logger, operation: "restore plan service" },
  (request, context) => handlePost(request, context!),
);

export function POST(request: Request, context: ServiceRouteContext) {
  return restoreService(request, context);
}
