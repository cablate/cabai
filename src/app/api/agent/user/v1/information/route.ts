import { parseQuery, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { userInformationListQuerySchema } from "@/lib/agent/user-information-schemas";
import { userInformationResultResponse } from "@/lib/agent/user-information-route";
import { listUnreadInformation } from "@/lib/services/user-information-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/information");

export const GET = withApiHandler(
  { logger, operation: "list unread user information" },
  async (request) => {
    const { userId } = await requireUserToken(request, "information:read");
    const query = parseQuery(request, userInformationListQuerySchema);

    return userInformationResultResponse(await listUnreadInformation({
      userId,
      cursor: query.cursor,
      limit: query.limit,
      ...(query.include === "summary" ? { include: query.include } : {}),
    }));
  },
);
