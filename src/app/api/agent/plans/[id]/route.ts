/**
 * PATCH  /api/agent/plans/[id]  — Edit local-only plan fields
 * DELETE /api/agent/plans/[id]  — Soft-delete (or archive if has orders)
 *
 * PATCH only allows local-only fields: status, featured (via hasPlatformContent /
 * hasExternalService flags are computed, not editable here).
 * Portaly-authoritative fields (amount, currency, billingCycle, name,
 * billingPeriod, pricingType) are intentionally excluded.
 *
 * DELETE is destructive — plans with orders are archived (set inactive)
 * rather than hard-deleted (mirrors the admin UI behavior in deletePlan).
 */
import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { deleteAgentPlan, updateAgentPlan } from "@/lib/services/agent-plan-service";
import { planUpdateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/[id]");

// Local-only fields. name/description are intentionally writable for
// manual-gateway plans (and accepted on Portaly plans too, though the
// next syncPlans run will overwrite local edits there — Portaly stays
// source of truth for those).
async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "plan:write");
    const { id: planId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = planUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateAgentPlan(planId, parsed.data, agent);
    if (result.kind === "not-found") return Response.json({ error: "Plan not found" }, { status: 404 });
    if (result.kind === "active-subscriptions") return Response.json({ error: `Plan has ${result.count} active subscription(s). Cancel all subscriptions before deactivating.` }, { status: 422 });
    if (result.kind === "invalid-slug") return Response.json({ error: result.message }, { status: 400 });
    if (result.kind === "slug-conflict") return Response.json({ error: "slug already in use" }, { status: 409 });

    return Response.json({ data: { updated: true, planId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to update plan", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireAgent(request, "plan:delete");
    const { id: planId } = await params;

    requireDestructiveConfirmation(request, planId);

    const result = await deleteAgentPlan(planId, agent);
    if (result.kind === "not-found") return Response.json({ error: "Plan not found" }, { status: 404 });
    if (result.kind === "archived") return Response.json({ data: { archived: true, deleted: false, planId } });
    return Response.json({ data: { deleted: true, archived: false, planId } });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("Failed to delete plan", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

type PlanRouteContext = { params: Promise<{ id: string }> };

const patchPlan = withApiHandler<PlanRouteContext>(
  { logger, operation: "update plan" },
  (request, context) => handlePatch(request, context!),
);

const deletePlan = withApiHandler<PlanRouteContext>(
  { logger, operation: "delete plan" },
  (request, context) => handleDelete(request, context!),
);

export function PATCH(request: Request, context: PlanRouteContext) {
  return patchPlan(request, context);
}

export function DELETE(request: Request, context: PlanRouteContext) {
  return deletePlan(request, context);
}
