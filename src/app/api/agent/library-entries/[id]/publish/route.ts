import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { requireIdempotencyKey } from "@/lib/agent/admin-idempotency";
import { libraryBundlePublishSchema, libraryEntryPathSchema } from "@/lib/agent/admin-domain-schemas";
import {
  domainResultResponse,
  requirePathIdentity,
  toDomainAgent,
} from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { publishLibraryInformationBundle } from "@/lib/services/publication-bundle-service";

const logger = createLogger("agent/library-entries/publish");
type RouteContext = { params: Promise<{ id: string }> };

const handlePost = withApiHandler<RouteContext>(
  { logger, operation: "publish Library and Information bundle" },
  async (request, context) => {
    const agent = await requireAgent(request, "library:publish");
    const { id } = await parsePathParams(context!, libraryEntryPathSchema);
    const input = await parseJsonBody(request, libraryBundlePublishSchema, {
      includeDetails: true,
    });
    requirePathIdentity(input.libraryId, id, "libraryId");
    const idempotencyKey = requireIdempotencyKey(request);
    requireDestructiveConfirmation(request, id);

    return domainResultResponse(await publishLibraryInformationBundle({
      ...input,
      actor: toDomainAgent(agent),
      idempotencyKey,
    }));
  },
);

export function POST(request: Request, context: RouteContext) {
  return handlePost(request, context);
}
