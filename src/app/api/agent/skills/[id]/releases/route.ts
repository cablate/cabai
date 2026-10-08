import { requireAgent } from "@/lib/agent-auth";
import { skillPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, requirePathIdentity, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { createWithIdempotency, deriveIdempotentResourceId, requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { dataResponse, parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createSkillRelease, createSkillReleaseInputSchema, getAdminSkillProjection, getAdminSkillRelease } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skills/releases");
type Context = { params: Promise<{ id: string }> };

const getHandler = withApiHandler<Context>({ logger, operation: "list Skill releases" }, async (request, context) => {
  await requireAgent(request, "skill:read");
  const { id } = await parsePathParams(context!, skillPathSchema);
  const result = await getAdminSkillProjection(id);
  return result.ok ? dataResponse(result.value.releases) : domainResultResponse(result);
});

const postHandler = withApiHandler<Context>({ logger, operation: "create Skill release" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:write");
  const { id } = await parsePathParams(context!, skillPathSchema);
  const input = await parseJsonBody(request, createSkillReleaseInputSchema, { includeDetails: true });
  requirePathIdentity(input.skillId, id, "skillId");
  const idempotencyKey = requireIdempotencyKey(request);
  const resourceId = deriveIdempotentResourceId({ actorId: agent.agentId, operationId: "createSkillRelease", idempotencyKey });
  const result = await createWithIdempotency({
    load: () => getAdminSkillRelease(resourceId),
    create: () => createSkillRelease(input, toDomainAgent(agent), { resourceId }),
    matches: (release) => release.skillId === input.skillId
      && release.version === input.version
      && release.compatibility === input.compatibility
      && release.contentMarkdown === input.contentMarkdown
      && release.license === input.license
      && release.changelogMarkdown === input.changelogMarkdown
      && release.accessPolicy === input.accessPolicy,
  });
  if (!result.ok) return domainResultResponse(result);
  return dataResponse(result.value.resource, result.value.replayed ? 200 : 201);
});

export function GET(request: Request, context: Context) { return getHandler(request, context); }
export function POST(request: Request, context: Context) { return postHandler(request, context); }
