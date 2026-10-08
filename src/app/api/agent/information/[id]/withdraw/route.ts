import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { informationPathSchema, informationTransitionSchema } from "@/lib/agent/admin-domain-schemas";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { withdrawInformation } from "@/lib/services/information-service";

const logger = createLogger("agent/information/withdraw");
type RouteContext = { params: Promise<{ id: string }> };

const handlePost = withApiHandler<RouteContext>(
  { logger, operation: "withdraw information" },
  async (request, context) => {
    const agent = await requireAgent(request, "information:publish");
    const { id } = await parsePathParams(context!, informationPathSchema);
    requireDestructiveConfirmation(request, id);
    const idempotencyKey = requireIdempotencyKey(request);
    const { expectedRevision } = await parseJsonBody(request, informationTransitionSchema, { includeDetails: true });
    return domainResultResponse(await withdrawInformation({
      informationId: id,
      expectedRevision,
      actor: toDomainAgent(agent),
      idempotencyKey,
    }));
  },
);

export function POST(request: Request, context: RouteContext) {
  return handlePost(request, context);
}
