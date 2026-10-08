import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listPublicSkillSummaries } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/public/v1/skills");

export const GET = withApiHandler(
  { logger, operation: "list public Skills" },
  async (request) => {
    await rejectInvalidSuppliedPublicCredential(request);
    return domainResultResponse(await listPublicSkillSummaries({ authenticated: false }));
  },
);
