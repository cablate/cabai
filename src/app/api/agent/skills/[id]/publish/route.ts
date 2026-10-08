import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { skillBundlePublishSchema, skillPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, requirePathIdentity, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { publishSkillInformationBundle } from "@/lib/services/publication-bundle-service";

const logger = createLogger("agent/skills/publish");
type Context = { params: Promise<{ id: string }> };
const handler = withApiHandler<Context>({ logger, operation: "publish Skill bundle" }, async (request, context) => {
  const agent = await requireAgent(request, "skill:publish");
  const { id } = await parsePathParams(context!, skillPathSchema);
  const input = await parseJsonBody(request, skillBundlePublishSchema, { includeDetails: true });
  requirePathIdentity(input.skillId, id, "skillId");
  requireDestructiveConfirmation(request, id);
  const idempotencyKey = requireIdempotencyKey(request);
  return domainResultResponse(await publishSkillInformationBundle({ ...input, actor: toDomainAgent(agent), idempotencyKey }));
});
export function POST(request: Request, context: Context) { return handler(request, context); }
