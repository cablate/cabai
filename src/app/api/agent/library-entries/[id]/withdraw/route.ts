import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { expectedRevisionSchema, libraryEntryPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { withdrawLibraryEntry } from "@/lib/services/library-service";

const logger = createLogger("agent/library-entries/withdraw");
type RouteContext = { params: Promise<{ id: string }> };

const handlePost = withApiHandler<RouteContext>(
  { logger, operation: "withdraw Library entry" },
  async (request, context) => {
    await requireAgent(request, "library:publish");
    const { id } = await parsePathParams(context!, libraryEntryPathSchema);
    const { expectedRevision } = await parseJsonBody(request, expectedRevisionSchema, {
      includeDetails: true,
    });
    requireDestructiveConfirmation(request, id);
    return domainResultResponse(await withdrawLibraryEntry({ id, expectedRevision }));
  },
);

export function POST(request: Request, context: RouteContext) {
  return handlePost(request, context);
}
