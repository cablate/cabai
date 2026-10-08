/**
 * POST /api/agent/chapters/[id]/restore
 *
 * Restore a soft-deleted chapter (and its child lessons).
 * Does NOT require destructive confirm — non-destructive.
 */
import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { dataResponse, errorResponse, withApiHandler } from "@/lib/api-route";
import { restoreAgentChapter } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/chapters/restore");

const handlePost = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "restore chapter" },
  async (request, context) => {
    const agent = await requireAgent(request, "content:write");
    const { id: chapterId } = await context!.params;

    if (!(await restoreAgentChapter(chapterId, agent.agentId))) {
      return errorResponse("Chapter not found or not deleted", 404);
    }

    return dataResponse({ id: chapterId, restored: true });
  },
);

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePost(request, context);
}
