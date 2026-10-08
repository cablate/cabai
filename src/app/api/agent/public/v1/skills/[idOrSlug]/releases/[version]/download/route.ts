import { z } from "zod";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { rejectInvalidSuppliedPublicCredential } from "@/lib/agent/public-user-route";
import { parsePathParams, withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { createSkillArtifactDownload } from "@/lib/services/skill-artifact-service";
import { domainSuccess } from "@/lib/services/library-skill-information-domain";
import { getPublicSkillReleaseProjection } from "@/lib/services/skill-release-service";

const logger = createLogger("agent/public/v1/skills/release/download");
const pathSchema = z.object({
  idOrSlug: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
}).strict();
type RouteContext = { params: Promise<{ idOrSlug: string; version: string }> };

const handleGet = withApiHandler<RouteContext>(
  { logger, operation: "create public Skill download" },
  async (request, context) => {
    await rejectInvalidSuppliedPublicCredential(request);
    const { idOrSlug, version } = await parsePathParams(context!, pathSchema);
    const release = await getPublicSkillReleaseProjection(
      idOrSlug,
      version,
      { authenticated: false },
    );
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
      authenticated: false,
    }));
  },
);

export function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
