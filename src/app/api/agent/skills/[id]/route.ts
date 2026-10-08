import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { skillPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getAdminSkillProjection, updateSkill, updateSkillInputSchema } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skills/detail");
type Context = { params: Promise<{ id: string }> };

const getHandler = withApiHandler<Context>({ logger, operation: "get Skill" }, async (request, context) => {
  await requireAgent(request, "skill:read");
  const { id } = await parsePathParams(context!, skillPathSchema);
  return domainResultResponse(await getAdminSkillProjection(id));
});

const patchHandler = withApiHandler<Context>({ logger, operation: "update Skill" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:write");
  const { id } = await parsePathParams(context!, skillPathSchema);
  const input = await parseJsonBody(request, updateSkillInputSchema, { includeDetails: true });
  const projection = await getAdminSkillProjection(id);
  const isPublished = projection.ok && projection.value.skill.status === "published";
  if (isPublished) {
    requireDestructiveConfirmation(request, id);
  }
  return domainResultResponse(await updateSkill(id, input, toDomainAgent(agent), {
    allowPublishedMetadata: isPublished,
    ...(isPublished ? { idempotencyKey: requireIdempotencyKey(request) } : {}),
  }));
});

export function GET(request: Request, context: Context) { return getHandler(request, context); }
export function PATCH(request: Request, context: Context) { return patchHandler(request, context); }
