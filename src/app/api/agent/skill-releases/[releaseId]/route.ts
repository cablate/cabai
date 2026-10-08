import { requireAgent } from "@/lib/agent-auth";
import { skillReleasePathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getAdminSkillRelease, updateSkillRelease, updateSkillReleaseInputSchema } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skill-releases/detail");
type Context = { params: Promise<{ releaseId: string }> };
const getHandler = withApiHandler<Context>({ logger, operation: "get Skill release" }, async (request, context) => {
  await requireAgent(request, "skill:read");
  const { releaseId } = await parsePathParams(context!, skillReleasePathSchema);
  return domainResultResponse(await getAdminSkillRelease(releaseId));
});
const patchHandler = withApiHandler<Context>({ logger, operation: "update Skill release" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:write");
  const { releaseId } = await parsePathParams(context!, skillReleasePathSchema);
  const input = await parseJsonBody(request, updateSkillReleaseInputSchema, { includeDetails: true });
  return domainResultResponse(await updateSkillRelease(releaseId, input, toDomainAgent(agent)));
});
export function GET(request: Request, context: Context) { return getHandler(request, context); }
export function PATCH(request: Request, context: Context) { return patchHandler(request, context); }
