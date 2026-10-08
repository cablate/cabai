/**
 * POST /api/agent/courses/[id]/restore
 *
 * Restore a soft-deleted course (clears deletedAt).
 * Does NOT require destructive confirm — non-destructive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { dataResponse, errorResponse, withApiHandler } from "@/lib/api-route";
import { restoreAgentCourse } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/courses/restore");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "restore course" },
  async (request, context) => {
    const agent = await requireAgent(request, "content:write");
    const { id: courseId } = await context!.params;

    if (!(await restoreAgentCourse(courseId, agent.agentId))) {
      return errorResponse("Course not found or not deleted", 404);
    }

    return dataResponse({ id: courseId, restored: true });
  },
);

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePost(request, context);
}
