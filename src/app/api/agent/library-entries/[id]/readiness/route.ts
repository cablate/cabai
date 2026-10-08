import { requireAgent } from "@/lib/agent-auth";
import { libraryEntryPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getLibraryEntryReadiness } from "@/lib/services/library-service";

const logger = createLogger("agent/library-entries/readiness");
type RouteContext = { params: Promise<{ id: string }> };

const handlePost = withApiHandler<RouteContext>(
  { logger, operation: "check Library entry readiness" },
  async (request, context) => {
    await requireAgent(request, "library:read");
    const { id } = await parsePathParams(context!, libraryEntryPathSchema);
    return domainResultResponse(await getLibraryEntryReadiness(id));
  },
);

export function POST(request: Request, context: RouteContext) {
  return handlePost(request, context);
}
