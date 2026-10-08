/**
 * PATCH  /api/agent/plans/[id]/contents/[contentId]  — update planContent
 * DELETE /api/agent/plans/[id]/contents/[contentId]  — soft-delete planContent
 */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { deleteAgentPlanContent, updateAgentPlanContent } from "@/lib/services/agent-plan-service";
import { planContentUpdateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/contents/[contentId]");

async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const agent = await requireAgent(request, "delivery:write");
    const { id: planId, contentId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planContentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateAgentPlanContent(planId, contentId, parsed.data, agent);
    if (result.kind === "not-found") {
      return Response.json({ error: "Plan content not found" }, { status: 404 });
    }

    return Response.json({ data: { updated: true, contentId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to update plan content", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const agent = await requireAgent(request, "delivery:write");
    const { id: planId, contentId } = await params;

    requireDestructiveConfirmation(request, contentId);

    const result = await deleteAgentPlanContent(planId, contentId, agent);
    if (result.kind === "not-found") {
      return Response.json({ error: "Plan content not found" }, { status: 404 });
    }

    return Response.json({ data: { deleted: true, contentId, planId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to delete plan content", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanContentRouteContext = { params: Promise<{ id: string; contentId: string }> };
const updatePlanContent = withApiHandler<PlanContentRouteContext>(
  { logger, operation: "update plan content" },
  (request, context) => handlePatch(request, context!),
);
const deletePlanContent = withApiHandler<PlanContentRouteContext>(
  { logger, operation: "delete plan content" },
  (request, context) => handleDelete(request, context!),
);
export function PATCH(request: Request, context: PlanContentRouteContext) {
  return updatePlanContent(request, context);
}
export function DELETE(request: Request, context: PlanContentRouteContext) {
  return deletePlanContent(request, context);
}
