import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { expectedRevisionSchema, skillPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { withdrawSkill } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skills/withdraw");
type Context = { params: Promise<{ id: string }> };
const handler = withApiHandler<Context>({ logger, operation: "withdraw Skill" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:publish");
  const { id } = await parsePathParams(context!, skillPathSchema);
  const input = await parseJsonBody(request, expectedRevisionSchema, { includeDetails: true });
  requireDestructiveConfirmation(request, id);
  return domainResultResponse(await withdrawSkill({ skillId: id, expectedRevision: input.expectedRevision }, toDomainAgent(agent)));
});
export function POST(request: Request, context: Context) { return handler(request, context); }
