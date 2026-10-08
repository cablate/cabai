/**
 * POST /api/agent/lessons/[id]/restore
 *
 * Restore a soft-deleted lesson.
 * Does NOT require destructive confirm — non-destructive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { dataResponse, errorResponse, withApiHandler } from "@/lib/api-route";
import { restoreAgentLesson } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/lessons/restore");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "restore lesson" },
  async (request, context) => {
    const agent = await requireAgent(request, "content:write");
    const { id: lessonId } = await context!.params;

    if (!(await restoreAgentLesson(lessonId, agent.agentId))) {
      return errorResponse("Lesson not found or not deleted", 404);
    }

    return dataResponse({ id: lessonId, restored: true });
  },
);

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePost(request, context);
}
