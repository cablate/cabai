import { requireAgent } from "@/lib/agent-auth";
import { skillReleasePathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getSkillReleaseReadiness } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skill-releases/readiness");
type Context = { params: Promise<{ releaseId: string }> };
const handler = withApiHandler<Context>({ logger, operation: "check Skill release readiness" }, async (request, context) => {
  await requireAgent(request, "skill:read");
  const { releaseId } = await parsePathParams(context!, skillReleasePathSchema);
  return domainResultResponse(await getSkillReleaseReadiness(releaseId));
});
export function POST(request: Request, context: Context) { return handler(request, context); }
