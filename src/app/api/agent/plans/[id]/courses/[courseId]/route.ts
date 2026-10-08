/**
 * DELETE /api/agent/plans/[id]/courses/[courseId]
 *
 * Unbind (soft-remove) a course from a plan.
 * Destructive — requires x-confirm-destructive: true.
 */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { unbindCourseFromPlan } from "@/lib/services/agent-plan-service";

const logger = createLogger("agent/plans/courses/[courseId]");

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string; courseId: string }> },
) {
  try {
    const agent = await requireAgent(request, "delivery:write");
    const { id: planId, courseId } = await params;

    requireDestructiveConfirmation(request, courseId);

    const result = await unbindCourseFromPlan(planId, courseId, agent);
    if (result.kind === "not-found") return Response.json({ error: "Course binding not found" }, { status: 404 });
    return Response.json({ data: result.data });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to unbind course from plan", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanCourseRouteContext = { params: Promise<{ id: string; courseId: string }> };
const unbindPlanCourse = withApiHandler<PlanCourseRouteContext>(
  { logger, operation: "unbind course from plan" },
  (request, context) => handleDelete(request, context!),
);
export function DELETE(request: Request, context: PlanCourseRouteContext) {
  return unbindPlanCourse(request, context);
}
