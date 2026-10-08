/**
 * GET /api/agent/courses/[id]/content — Course content for external AI agents
 *
 * Auth: Bearer cab_user_xxx token with "course:read" scope
 *
 * Without ?lesson_id: returns course structure with lesson metadata (no content)
 * With ?lesson_id=X: returns only that lesson's full content
 */
import { requireUserToken } from "@/lib/user-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { getUserCourseContent } from "@/lib/services/agent-content-service";

const logger = createLogger("agent/courses/content");

const handleGet = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "fetch course content", internalError: "Server error" },
  async (request, context) => {
    const { userId } = await requireUserToken(request, "course:read");
    const { id: courseId } = await context!.params;
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lesson_id");

    const result = await getUserCourseContent(userId, courseId, lessonId);
    if (result.kind === "course-not-found") {
      return Response.json({ error: "Course not found" }, { status: 404 });
    }
    if (result.kind === "forbidden") {
      return Response.json(
        { error: "You do not have access to this course" },
        { status: 403 },
      );
    }
    if (result.kind === "lesson-not-found") {
      return Response.json({ error: "Lesson not found" }, { status: 404 });
    }
    return Response.json(result.data);
  },
);

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleGet(request, context);
}
