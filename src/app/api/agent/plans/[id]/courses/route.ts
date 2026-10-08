/**
 * POST /api/agent/plans/[id]/courses
 *
 * Bind a course to a plan via the plan_courses junction table.
 * Body: { courseId: string }
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { bindCourseToPlan } from "@/lib/services/agent-plan-service";
import { planCourseBindSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/courses");

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "delivery:write");
    const { id: planId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planCourseBindSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { courseId } = parsed.data;

    const result = await bindCourseToPlan(planId, courseId, agent);
    if (result.kind === "plan-not-found") return Response.json({ error: "Plan not found" }, { status: 404 });
    if (result.kind === "course-not-found") return Response.json({ error: "Course not found" }, { status: 404 });
    if (result.kind === "already-bound") return Response.json({ error: "Course is already bound to this plan", id: result.id }, { status: 409 });
    return Response.json({ data: result.data }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to bind course to plan", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanCourseRouteContext = { params: Promise<{ id: string }> };
const bindPlanCourse = withApiHandler<PlanCourseRouteContext>(
  { logger, operation: "bind course to plan" },
  (request, context) => handlePost(request, context!),
);
export function POST(request: Request, context: PlanCourseRouteContext) {
  return bindPlanCourse(request, context);
}
