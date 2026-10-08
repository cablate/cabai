/**
 * GET    /api/agent/plans/[id]/contents  — list PlanContent
 * POST   /api/agent/plans/[id]/contents  — create PlanContent
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { createAgentPlanContent, listAgentPlanContents } from "@/lib/services/agent-plan-service";
import { planContentCreateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/contents");

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAgent(request, "content:read");
    const { id: planId } = await params;

    const url = new URL(request.url);
    const result = await listAgentPlanContents(planId, url.searchParams.get("includeDeleted") === "true");
    if (result.kind === "plan-not-found") {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    return Response.json({ data: result.data });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to list plan contents", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "delivery:write");
    const { id: planId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planContentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createAgentPlanContent(planId, parsed.data, agent);
    if (result.kind === "plan-not-found") {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    return Response.json({ data: result.data }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to create plan content", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanContentRouteContext = { params: Promise<{ id: string }> };
const listPlanContents = withApiHandler<PlanContentRouteContext>(
  { logger, operation: "list plan contents" },
  (request, context) => handleGet(request, context!),
);
const createPlanContent = withApiHandler<PlanContentRouteContext>(
  { logger, operation: "create plan content" },
  (request, context) => handlePost(request, context!),
);
export function GET(request: Request, context: PlanContentRouteContext) {
  return listPlanContents(request, context);
}
export function POST(request: Request, context: PlanContentRouteContext) {
  return createPlanContent(request, context);
}
