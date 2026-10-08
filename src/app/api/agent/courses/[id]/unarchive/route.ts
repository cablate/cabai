/**
 * POST /api/agent/courses/[id]/unarchive
 *
 * Unarchive a course (status: "archived" → "draft").
 * Does NOT require destructive confirm — non-destructive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { dataResponse, errorResponse, withApiHandler } from "@/lib/api-route";
import { unarchiveAgentCourse } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/courses/unarchive");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "unarchive course" },
  async (request, context) => {
    const agent = await requireAgent(request, "content:write");
    const { id: courseId } = await context!.params;

    const result = await unarchiveAgentCourse(courseId, { id: agent.agentId, name: agent.name });
    if (result === "not-found") {
      return errorResponse("Course not found", 404);
    }
    if (result === "not-archived") {
      return errorResponse("Course is not archived", 409);
    }

    return dataResponse({ id: courseId, status: "draft" });
  },
);

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePost(request, context);
}
