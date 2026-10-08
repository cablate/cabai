import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { userInformationPathSchema } from "@/lib/agent/user-information-schemas";
import { userInformationResultResponse } from "@/lib/agent/user-information-route";
import { getVisibleInformation } from "@/lib/services/user-information-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/information/detail");
type RouteContext = { params: Promise<{ id: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get visible user information" },
  async (request, context) => {
    const { userId } = await requireUserToken(request, "information:read");
    const { id } = await parsePathParams(context!, userInformationPathSchema);

    return userInformationResultResponse(await getVisibleInformation({
      userId,
      informationId: id,
    }));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
