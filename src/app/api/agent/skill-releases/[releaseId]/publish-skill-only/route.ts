import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { skillReleasePathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse, requirePathIdentity, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import {
  publishSkillRelease,
  publishSkillReleaseInputSchema,
} from "@/lib/services/skill-release-service";

const logger = createLogger("agent/skill-releases/publish-skill-only");
type Context = { params: Promise<{ releaseId: string }> };

const handler = withApiHandler<Context>(
  { logger, operation: "publish Skill release without Information" },
  async (request, context) => {
    const agent = await requireAgent(request, "skill:publish");
    const { releaseId } = await parsePathParams(context!, skillReleasePathSchema);
    const input = await parseJsonBody(request, publishSkillReleaseInputSchema, { includeDetails: true });
    requirePathIdentity(input.releaseId, releaseId, "releaseId");
    requireDestructiveConfirmation(request, releaseId);
    requireIdempotencyKey(request);
    return domainResultResponse(await publishSkillRelease(input, toDomainAgent(agent)));
  },
);

export function POST(request: Request, context: Context) {
  return handler(request, context);
}
