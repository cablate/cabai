import { requireAgent } from "@/lib/agent-auth";
import { informationSourceDraftSchema } from "@/lib/agent/admin-domain-schemas";
import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import { parseJsonBody, withApiHandler } from "@/lib/api-route";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { createLogger } from "@/lib/logger";

const logger = createLogger("agent/information/source-draft");

export const POST = withApiHandler(
  { logger, operation: "prepare information source draft" },
  async (request) => {
    await requireAgent(request, "information:write");
    const input = await parseJsonBody(request, informationSourceDraftSchema, { includeDetails: true });
    const source = input.kind
      ? await buildInformationSourceBundle(input.sourceType, input.sourceId ?? "", { kind: input.kind })
      : await buildInformationSourceBundle(input.sourceType, input.sourceId ?? "");
    return domainResultResponse(source);
  },
);
