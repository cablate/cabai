/**
 * POST /api/agent/courses/[id]/archive
 *
 * Archive (status → "archived") a course.
 * Does NOT require destructive confirm — reversible via /unarchive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { dataResponse, errorResponse, withApiHandler } from "@/lib/api-route";
import { archiveAgentCourse } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/courses/archive");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "archive course" },
  async (request, context) => {
    const agent = await requireAgent(request, "content:write");
    const { id: courseId } = await context!.params;

    const result = await archiveAgentCourse(courseId, agent.agentId);
    if (result === "not-found") {
      return errorResponse("Course not found", 404);
    }
    if (result === "already-archived") {
      return errorResponse("Course is already archived", 409);
    }

    return dataResponse({ id: courseId, status: "archived" });
  },
);

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePost(request, context);
}
