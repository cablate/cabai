import { requireAgent } from "@/lib/agent-auth";
import { libraryEntryPathSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import {
  getLibraryEntry,
  updateLibraryEntry,
  updateLibraryEntrySchema,
} from "@/lib/services/library-service";

const logger = createLogger("agent/library-entries/detail");
type RouteContext = { params: Promise<{ id: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get Library entry" },
  async (request, context) => {
    await requireAgent(request, "library:read");
    const { id } = await parsePathParams(context!, libraryEntryPathSchema);
    return domainResultResponse(await getLibraryEntry(id));
  },
);

const handlePatch = withApiHandler<RouteContext>(
  { logger, operation: "update Library entry" },
  async (request, context) => {
    await requireAgent(request, "library:write");
    const { id } = await parsePathParams(context!, libraryEntryPathSchema);
    const input = await parseJsonBody(request, updateLibraryEntrySchema, {
      includeDetails: true,
    });
    return domainResultResponse(await updateLibraryEntry(id, input));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return handlePatch(request, context);
}
