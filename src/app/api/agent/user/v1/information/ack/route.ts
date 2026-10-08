import { parseJsonBody, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { userInformationAckSchema } from "@/lib/agent/user-information-schemas";
import { userInformationResultResponse } from "@/lib/agent/user-information-route";
import { acknowledgeInformation } from "@/lib/services/user-information-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/information/ack");

export const POST = withApiHandler(
  { logger, operation: "acknowledge user information" },
  async (request) => {
    const { userId } = await requireUserToken(request, "information:ack");
    const input = await parseJsonBody(request, userInformationAckSchema, {
      includeDetails: true,
    });

    return userInformationResultResponse(await acknowledgeInformation({
      userId,
      informationIds: input.informationIds,
    }));
  },
);
