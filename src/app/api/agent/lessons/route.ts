import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import {
  dataResponse,
  parseJsonBody,
  requiredQueryParam,
  successResponse,
  withApiHandler,
} from "@/lib/api-route";
import { createLesson, updateLesson, deleteLesson } from "@/lib/services/course-service";
import { listAgentLessons } from "@/lib/services/agent-content-service";
import { createLogger } from "@/lib/logger";
import { entityDeleteSchema, lessonCreateSchema, lessonUpdateSchema } from "@/lib/agent/content-schemas";

const logger = createLogger("agent/lessons");

export const GET = withApiHandler(
  { logger, operation: "list lessons", internalError: "Server error" },
  async (request) => {
    await requireAgent(request, "content:read");
    const courseId = requiredQueryParam(request, "courseId");
    return dataResponse(await listAgentLessons(courseId));
  },
);

export const POST = withApiHandler(
  { logger, operation: "create lesson" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const input = await parseJsonBody(request, lessonCreateSchema, {
      includeDetails: true,
    });
    const lesson = await createLesson(input, {
      type: "agent",
      id: agent.agentId,
    });
    return dataResponse(lesson, 201);
  },
);

export const PATCH = withApiHandler(
  { logger, operation: "update lesson" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const { id, ...input } = await parseJsonBody(request, lessonUpdateSchema);
    await updateLesson(id, input, { type: "agent", id: agent.agentId });
    return successResponse();
  },
);

export const DELETE = withApiHandler(
  { logger, operation: "delete lesson" },
  async (request) => {
    const input = await parseJsonBody(request, entityDeleteSchema);
    const agent = await requireAgent(request, "content:delete");
    requireDestructiveConfirmation(request, input.id);
    await deleteLesson(input.id, { type: "agent", id: agent.agentId });
    return successResponse();
  },
);
