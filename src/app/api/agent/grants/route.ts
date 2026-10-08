import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createAgentGrant, listAgentGrants, revokeAgentGrant } from "@/lib/services/agent-operations-service";
import { grantCreateSchema, grantRevokeSchema } from "@/lib/agent/operations-schemas";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";

const logger = createLogger("agent-grants");

export const POST = withApiHandler({ logger, operation: "create manual grant", internalError: "Server error" }, async (request) => {
  const actor = await requireAgent(request, "entitlements:write");
  const parsed = grantCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  requireDestructiveConfirmation(request, `${parsed.data.userId}:${parsed.data.planId}`);
  const idempotencyKey = requireIdempotencyKey(request);
  const result = await createAgentGrant({ ...parsed.data, idempotencyKey, actor });
  if (result.kind === "user-not-found") return Response.json({ error: "User not found" }, { status: 404 });
  if (result.kind === "plan-not-found") return Response.json({ error: "Plan not found" }, { status: 404 });
  if (result.kind === "duplicate") return Response.json({ error: "User already has an active grant for this plan", purchaseId: result.purchaseId }, { status: 409 });
  if (result.kind === "replayed") return Response.json({ data: { ...result.data, replayed: true } }, { status: 200 });
  logger.info("Manual grant created", { agentId: actor.agentId, purchaseId: result.data.id, userId: parsed.data.userId, planId: parsed.data.planId });
  return Response.json({ data: result.data }, { status: 201 });
});

export const DELETE = withApiHandler({ logger, operation: "revoke manual grant", internalError: "Server error" }, async (request) => {
  const actor = await requireAgent(request, "entitlements:write");
  const parsed = grantRevokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  requireDestructiveConfirmation(request, parsed.data.purchaseId);
  const revoked = await revokeAgentGrant({ purchaseId: parsed.data.purchaseId, actor });
  if (!revoked) return Response.json({ error: "Purchase not found or already revoked" }, { status: 404 });
  logger.info("Grant revoked", { agentId: actor.agentId, purchaseId: parsed.data.purchaseId, userId: revoked.userId, planId: revoked.planId });
  return Response.json({ data: { revoked: true, purchaseId: parsed.data.purchaseId, auditId: revoked.auditId } });
});

export const GET = withApiHandler({ logger, operation: "list manual grants", internalError: "Server error" }, async (request) => {
  await requireAgent(request, "members:read");
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return Response.json({ error: "Missing required query param: userId" }, { status: 400 });
  return Response.json({ data: await listAgentGrants(userId) });
});
