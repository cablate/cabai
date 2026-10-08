import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { getPublicSkillProjection } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/public/v1/skills/detail");
const pathSchema = z.object({ idOrSlug: z.string().min(1).max(200) }).strict();
type RouteContext = { params: Promise<{ idOrSlug: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "get public Skill" },
  async (request, context) => {
    await rejectInvalidSuppliedPublicCredential(request);
    const { idOrSlug } = await parsePathParams(context!, pathSchema);
    return domainResultResponse(await getPublicSkillProjection(idOrSlug, { authenticated: false }));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
