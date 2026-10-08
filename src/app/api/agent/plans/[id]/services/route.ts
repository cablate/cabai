/**
 * GET   /api/agent/plans/[id]/services  — list ServiceConfigs for a plan
 * POST  /api/agent/plans/[id]/services  — create a ServiceConfig
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { createAgentPlanService, listAgentPlanServices } from "@/lib/services/agent-plan-service";
import { planServiceCreateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/services");

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAgent(request, "content:read");
    const { id: planId } = await params;

    const result = await listAgentPlanServices(planId);
    if (result.kind === "plan-not-found") {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    return Response.json({ data: result.data });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "service:write");
    const { id: planId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planServiceCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createAgentPlanService(planId, parsed.data, agent);
    if (result.kind === "plan-not-found") {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    if (result.kind === "unsafe-url") {
      return Response.json({ error: result.error }, { status: 400 });
    }
    logger.info("Service config created", {
      agentId: agent.agentId,
      serviceId: result.data.id,
      planId,
      serviceName: parsed.data.serviceName,
    });

    // Return the plain API key once — it will not be retrievable afterwards
    return Response.json(
      { data: result.data },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return Response.json(
        { error: "A service with this name already exists for this plan" },
        { status: 409 },
      );
    }
    logger.error("Failed to create service config", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanServiceRouteContext = { params: Promise<{ id: string }> };
const listPlanServices = withApiHandler<PlanServiceRouteContext>(
  { logger, operation: "list plan services", internalError: "Server error" },
  (request, context) => handleGet(request, context!),
);
const createPlanService = withApiHandler<PlanServiceRouteContext>(
  { logger, operation: "create plan service" },
  (request, context) => handlePost(request, context!),
);
export function GET(request: Request, context: PlanServiceRouteContext) {
  return listPlanServices(request, context);
}
export function POST(request: Request, context: PlanServiceRouteContext) {
  return createPlanService(request, context);
}
