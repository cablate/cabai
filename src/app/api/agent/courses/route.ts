import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import {
  dataResponse,
  errorResponse,
  parseJsonBody,
  successResponse,
  withApiHandler,
} from "@/lib/api-route";
import { requireUserToken } from "@/lib/user-auth";
import { createCourse, updateCourse, deleteCourse } from "@/lib/services/course-service";
import { getAgentCourseDetail, listAgentCourses, listUserTokenCourses } from "@/lib/services/agent-content-service";
import { createLogger } from "@/lib/logger";
import { courseCreateSchema, courseUpdateSchema, entityDeleteSchema } from "@/lib/agent/content-schemas";

const logger = createLogger("agent/courses");

export const GET = withApiHandler(
  { logger, operation: "list courses", internalError: "Server error" },
  async (request) => {
    const courseId = new URL(request.url).searchParams.get("id");

    let agentAuth: { keyId: string; name: string; agentId: string } | null = null;
    let userAuth: { userId: string; tokenId: string } | null = null;

    try {
      agentAuth = await requireAgent(request, "content:read");
    } catch {
      try {
        userAuth = await requireUserToken(request, "course:read");
      } catch {
        throw errorResponse("Invalid, revoked, or expired token", 401);
      }
    }

    if (agentAuth && courseId) {
      const course = await getAgentCourseDetail(courseId);
      if (!course) return errorResponse("Course not found", 404);
      return dataResponse(course);
    }

    if (userAuth) {
      return dataResponse(await listUserTokenCourses(userAuth.userId));
    }

    return dataResponse(await listAgentCourses());
  },
);

export const POST = withApiHandler(
  { logger, operation: "create course" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const input = await parseJsonBody(request, courseCreateSchema, {
      includeDetails: true,
    });
    const course = await createCourse(input, {
      type: "agent",
      id: agent.agentId,
    });
    return dataResponse(course, 201);
  },
);

export const PATCH = withApiHandler(
  { logger, operation: "update course" },
  async (request) => {
    const agent = await requireAgent(request, "content:write");
    const { id, ...input } = await parseJsonBody(request, courseUpdateSchema, {
      includeDetails: true,
    });
    await updateCourse(
      id,
      { title: input.title, description: input.description },
      { type: "agent", id: agent.agentId },
    );
    return successResponse();
  },
);

export const DELETE = withApiHandler(
  { logger, operation: "delete course" },
  async (request) => {
    const input = await parseJsonBody(request, entityDeleteSchema);
    const agent = await requireAgent(request, "content:delete");
    requireDestructiveConfirmation(request, input.id);
    await deleteCourse(input.id, { type: "agent", id: agent.agentId });
    return successResponse();
  },
);
