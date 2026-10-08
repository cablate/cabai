import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getPublicSkillReleaseProjection } from "@/lib/services/skill-release-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/v1/skills/release");
const pathSchema = z.object({
  id: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
}).strict();
type RouteContext = { params: Promise<{ id: string; version: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get user Skill release" },
  async (request, context) => {
    await requireUserToken(request, "skill:read");
    const { id, version } = await parsePathParams(context!, pathSchema);
    return domainResultResponse(
      await getPublicSkillReleaseProjection(id, version, { authenticated: true }),
    );
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
