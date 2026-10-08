import { requireAgent } from "@/lib/agent-auth";
import { skillPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getSkillReadiness } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skills/readiness");
type Context = { params: Promise<{ id: string }> };
const handler = withApiHandler<Context>({ logger, operation: "check Skill readiness" }, async (request, context) => {
  await requireAgent(request, "skill:read");
  const { id } = await parsePathParams(context!, skillPathSchema);
  return domainResultResponse(await getSkillReadiness(id));
});
export function POST(request: Request, context: Context) { return handler(request, context); }
