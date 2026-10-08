import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getPublicSkillReleaseProjection } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/public/v1/skills/release");
const pathSchema = z.object({
  idOrSlug: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
}).strict();
type RouteContext = { params: Promise<{ idOrSlug: string; version: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get public Skill release" },
  async (request, context) => {
    await rejectInvalidSuppliedPublicCredential(request);
    const { idOrSlug, version } = await parsePathParams(context!, pathSchema);
    return domainResultResponse(
      await getPublicSkillReleaseProjection(idOrSlug, version, { authenticated: false }),
    );
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
