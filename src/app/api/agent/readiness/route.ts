import { requireAgent } from "@/lib/agent-auth";
import { dataResponse, parseJsonBody, withApiHandler } from "@/lib/api-route";
import { validateCourseReadiness } from "@/lib/course-validation";
import { createLogger } from "@/lib/logger";
import { courseIdSchema } from "@/lib/agent/content-schemas";

const logger = createLogger("agent/readiness");
export const POST = withApiHandler(
  { logger, operation: "validate course readiness" },
  async (request) => {
    await requireAgent(request, "content:publish");
    const input = await parseJsonBody(request, courseIdSchema, {
      invalidMessage: "courseId is required",
    });
    return dataResponse(await validateCourseReadiness(input.courseId));
  },
);
