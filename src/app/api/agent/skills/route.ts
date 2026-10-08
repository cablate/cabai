import { requireAgent } from "@/lib/agent-auth";
import { createWithIdempotency, deriveIdempotentResourceId, requireIdempotencyKey, sameStringArray } from "@/lib/agent/admin-idempotency";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { dataResponse, parseJsonBody, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { domainSuccess } from "@/lib/services/library-skill-information-domain";
import {
  createSkill,
  createSkillInputSchema,
  getAdminSkillProjection,
  listAdminSkills,
  type AdminSkillProjection,
} from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skills");

export const GET = withApiHandler(
  { logger, operation: "list Skills" },
  async (request) => {
    await requireAgent(request, "skill:read");
    return domainResultResponse(await listAdminSkills());
  },
);

export const POST = withApiHandler(
  { logger, operation: "create Skill" },
  async (request) => {
    const agent = await requireAgent(request, "skill:write");
    const input = await parseJsonBody(request, createSkillInputSchema, { includeDetails: true });
    const idempotencyKey = requireIdempotencyKey(request);
    const resourceId = deriveIdempotentResourceId({
      actorId: agent.agentId,
      operationId: "createSkill",
      idempotencyKey,
    });
    const actor = toDomainAgent(agent);

    const result = await createWithIdempotency<AdminSkillProjection>({
      load: () => getAdminSkillProjection(resourceId),
      create: async () => {
        const created = await createSkill(input, actor, { resourceId });
        return created.ok ? domainSuccess({ skill: created.value, releases: [] }) : created;
      },
      matches: ({ skill }) => skill.slug === input.slug
        && skill.title === input.title
        && skill.summary === input.summary
        && sameStringArray(skill.tags, input.tags)
        && skill.bodyMarkdown === input.bodyMarkdown
        && skill.distributionMode === input.distributionMode
        && skill.sourceRepositoryUrl === input.sourceRepositoryUrl
        && skill.sourceRef === input.sourceRef,
    });
    if (!result.ok) return domainResultResponse(result);
    return dataResponse(result.value.resource.skill, result.value.replayed ? 200 : 201);
  },
);
