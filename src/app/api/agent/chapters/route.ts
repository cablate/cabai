import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import {
  dataResponse,
  parseJsonBody,
  requiredQueryParam,
  successResponse,
  withApiHandler,
} from "@/lib/api-route";
import { createChapter, updateChapter, deleteChapter } from "@/lib/services/course-service";
import { listAgentChapters } from "@/lib/services/agent-content-service";
import { createLogger } from "@/lib/logger";
import { chapterCreateSchema, chapterUpdateSchema, entityDeleteSchema } from "@/lib/agent/content-schemas";

const logger = createLogger("agent/chapters");

export const GET = withApiHandler(
  { logger, operation: "list chapters", internalError: "Server error" },
  async (request) => {
    await requireAgent(request, "content:read");
    const courseId = requiredQueryParam(request, "courseId");
    return dataResponse(await listAgentChapters(courseId));
  },
);

export const POST = withApiHandler(
  { logger, operation: "create chapter" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const input = await parseJsonBody(request, chapterCreateSchema, {
      includeDetails: true,
    });
    const chapter = await createChapter(input, {
      type: "agent",
      id: agent.agentId,
    });
    return dataResponse(chapter, 201);
  },
);

export const PATCH = withApiHandler(
  { logger, operation: "update chapter" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const { id, ...input } = await parseJsonBody(request, chapterUpdateSchema);
    await updateChapter(id, input, { type: "agent", id: agent.agentId });
    return successResponse();
  },
);

export const DELETE = withApiHandler(
  { logger, operation: "delete chapter" },
  async (request) => {
    const input = await parseJsonBody(request, entityDeleteSchema);
    const agent = await requireAgent(request, "content:delete");
    requireDestructiveConfirmation(request, input.id);
    await deleteChapter(input.id, { type: "agent", id: agent.agentId });
    return successResponse();
  },
);
