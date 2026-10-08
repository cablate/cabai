import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";

const logger = createLogger("agent/public/v1/library");

export const GET = withApiHandler(
  { logger, operation: "list public Library entries" },
  async (request) => {
    await rejectInvalidSuppliedPublicCredential(request);
    return domainResultResponse(await listPublishedLibraryEntries());
  },
);
