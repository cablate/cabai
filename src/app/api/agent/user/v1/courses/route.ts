import { dataResponse, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listUserTokenCourseSummaries } from "@/lib/services/agent-content-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/courses");

export const GET = withApiHandler(
  { logger, operation: "list entitled user course summaries" },
  async (request) => {
    const { userId } = await requireUserToken(request, "course:read");
    return dataResponse(await listUserTokenCourseSummaries(userId));
  },
);
