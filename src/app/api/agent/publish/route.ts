import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { parseJsonBody, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { courseInformationPublishSchema } from "@/lib/agent/content-schemas";
import { domainResultResponse, toDomainAgent } from "@/lib/agent/admin-domain-route";
import { publishCourseInformationBundle } from "@/lib/services/publication-bundle-service";

const logger = createLogger("agent/publish");
export const POST = withApiHandler(
  { logger, operation: "publish course bundle" },
  async (request) => {
    const input = await parseJsonBody(request, courseInformationPublishSchema, {
      invalidMessage: "Course and Information bundle input is required",
      includeDetails: true,
    });
    const agent = await requireAgent(request, "content:publish");
    requireDestructiveConfirmation(request, input.courseId);
    return domainResultResponse(await publishCourseInformationBundle({
      ...input,
      actor: toDomainAgent(agent),
    }));
  },
);
