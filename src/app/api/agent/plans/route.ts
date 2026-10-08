import { requireAgent } from "@/lib/agent-auth";
import { validatePlanSlug } from "@/lib/validate-plan-slug";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { createAgentPlan, listAgentPlans } from "@/lib/services/agent-plan-service";
import { planCreateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans");

/**
 * POST /api/agent/plans — Create a new manual-gateway plan.
 *
 * Agents can only create gateway="manual" plans; Portaly plans must be
 * created via the admin UI so the Portaly sync chain runs correctly.
 *
 * `id` is optional — pass a friendly string (e.g. "ai-coding-pain-points-manual")
 * if you want a memorable identifier, otherwise a UUID is generated. The id
 * must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/. Use the `slug` field for the
 * URL-facing canonical name; id is the immutable primary key.
 */
async function handlePost(request: Request) {
  try {
    const agent = await requireAgent(request, "plan:write");

    const body = await request.json().catch(() => null);
    const parsed = planCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    // Validate slug if provided
    let slug: string | null = null;
    const slugRaw = (data.slug ?? "").trim();
    if (slugRaw !== "") {
      const slugResult = validatePlanSlug(slugRaw);
      if (!slugResult.ok) {
        return Response.json({ error: slugResult.message }, { status: 400 });
      }
      slug = slugResult.slug;
    }
    const result = await createAgentPlan({ ...data, slug }, agent);
    if (result.kind === "id-conflict") return Response.json({ error: "Plan id already exists" }, { status: 409 });
    if (result.kind === "slug-conflict") return Response.json({ error: "slug already in use" }, { status: 409 });
    return Response.json({ data: result.data }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error("plan POST failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/agent/plans — List all plans with display names
 */
async function handleGet(request: Request) {
  try {
    await requireAgent(request, "content:read");

    return Response.json({ data: await listAgentPlans() });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

export const POST = withApiHandler(
  { logger, operation: "create plan", internalError: "Server error" },
  handlePost,
);

export const GET = withApiHandler(
  { logger, operation: "list plans", internalError: "Server error" },
  handleGet,
);
