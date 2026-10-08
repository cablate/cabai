/**
 * POST /api/agent/plans/[id]/presentation/unpublish  ⚠️ Destructive
 *
 * Unpublish a plan presentation (clears publishedAt).
 * Requires content:publish permission + x-confirm-destructive: true header.
 */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { setPlanPresentationPublished } from "@/lib/services/agent-plan-service";

const logger = createLogger("agent/plans/presentation/unpublish");

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "content:publish");
    const { id: planId } = await params;

    requireDestructiveConfirmation(request);

    const result = await setPlanPresentationPublished(planId, false, agent);
    if (result.kind === "plan-not-found") return Response.json({ error: "Plan not found" }, { status: 404 });
    if (result.kind === "presentation-not-found") return Response.json({ error: "Presentation not found" }, { status: 404 });

    logger.info("Presentation unpublished", { agentId: agent.agentId, planId });

    return Response.json({ data: { unpublished: true, planId, id: result.id } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to unpublish presentation", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PresentationRouteContext = { params: Promise<{ id: string }> };
const unpublishPresentation = withApiHandler<PresentationRouteContext>(
  { logger, operation: "unpublish plan presentation" },
  (request, context) => handlePost(request, context!),
);

export function POST(request: Request, context: PresentationRouteContext) {
  return unpublishPresentation(request, context);
}
