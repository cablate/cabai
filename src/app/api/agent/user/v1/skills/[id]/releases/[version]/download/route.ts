import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createSkillArtifactDownload } from "@/lib/services/skill-artifact-service";
import { domainSuccess } from "@/lib/services/library-skill-information-domain";
import { getPublicSkillReleaseProjection } from "@/lib/services/skill-release-service";
import { requireUserToken } from "@/lib/user-auth";

const logger = createLogger("agent/user/v1/skills/release/download");
const pathSchema = z.object({
  id: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
}).strict();
type RouteContext = { params: Promise<{ id: string; version: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "create user Skill download" },
  async (request, context) => {
    await requireUserToken(request, "skill:read");
    const { id, version } = await parsePathParams(context!, pathSchema);
    const release = await getPublicSkillReleaseProjection(id, version, { authenticated: true });
    if (!release.ok) return domainResultResponse(release);
    if (release.value.distribution.mode === "github") {
      return domainResultResponse(domainSuccess({
        source: "github" as const,
        url: release.value.distribution.sourceArchiveUrl,
        expiresIn: null,
      }));
    }
    return domainResultResponse(await createSkillArtifactDownload({
      releaseId: release.value.id,
      authenticated: true,
    }));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
