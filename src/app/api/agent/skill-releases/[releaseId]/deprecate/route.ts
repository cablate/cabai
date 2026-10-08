import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { expectedRevisionSchema, skillReleasePathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { deprecateSkillRelease } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skill-releases/deprecate");
type Context = { params: Promise<{ releaseId: string }> };
const handler = withApiHandler<Context>({ logger, operation: "deprecate Skill release" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:publish");
  const { releaseId } = await parsePathParams(context!, skillReleasePathSchema);
  const input = await parseJsonBody(request, expectedRevisionSchema, { includeDetails: true });
  requireDestructiveConfirmation(request, releaseId);
  return domainResultResponse(await deprecateSkillRelease({ releaseId, expectedRevision: input.expectedRevision }, toDomainAgent(agent)));
});
export function POST(request: Request, context: Context) { return handler(request, context); }
