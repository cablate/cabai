import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getPublishedLibraryEntry } from "@/lib/services/library-service";

const logger = createLogger("agent/public/v1/library/detail");
const pathSchema = z.object({ idOrSlug: z.string().trim().min(1) });
type RouteContext = { params: Promise<{ idOrSlug: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get public Library entry" },
  async (request, context) => {
    await rejectInvalidSuppliedPublicCredential(request);
    const { idOrSlug } = await parsePathParams(context!, pathSchema);
    return domainResultResponse(await getPublishedLibraryEntry(idOrSlug));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
