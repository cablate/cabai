/**
 * PATCH  /api/agent/plans/[id]/services/[serviceId]  — update ServiceConfig
 * DELETE /api/agent/plans/[id]/services/[serviceId]  — soft-delete ServiceConfig
 */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { deleteAgentPlanService, updateAgentPlanService } from "@/lib/services/agent-plan-service";
import { planServiceUpdateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/services/[serviceId]");

async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  try {
    const agent = await requireAgent(request, "service:write");
    const { id: planId, serviceId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planServiceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateAgentPlanService(planId, serviceId, parsed.data, agent);
    if (result.kind === "not-found") {
      return Response.json({ error: "Service config not found" }, { status: 404 });
    }
    if (result.kind === "unsafe-url") {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ data: { updated: true, serviceId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to update service config", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  try {
    const agent = await requireAgent(request, "service:write");
    const { id: planId, serviceId } = await params;

    requireDestructiveConfirmation(request, serviceId);

    const result = await deleteAgentPlanService(planId, serviceId, agent);
    if (result.kind === "not-found") {
      return Response.json({ error: "Service config not found" }, { status: 404 });
    }

    return Response.json({ data: { deleted: true, serviceId, planId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to delete service config", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanServiceRouteContext = { params: Promise<{ id: string; serviceId: string }> };
const updatePlanService = withApiHandler<PlanServiceRouteContext>(
  { logger, operation: "update plan service" },
  (request, context) => handlePatch(request, context!),
);
const deletePlanService = withApiHandler<PlanServiceRouteContext>(
  { logger, operation: "delete plan service" },
  (request, context) => handleDelete(request, context!),
);
export function PATCH(request: Request, context: PlanServiceRouteContext) {
  return updatePlanService(request, context);
}
export function DELETE(request: Request, context: PlanServiceRouteContext) {
  return deletePlanService(request, context);
}
