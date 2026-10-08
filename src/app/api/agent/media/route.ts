import { requireAgent, parseAgentLimit } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listAgentMedia } from "@/lib/services/agent-operations-service";
import { mediaContextSchema, mediaStatusSchema } from "@/lib/agent/operations-schemas";

const logger = createLogger("agent/media");
export const GET = withApiHandler({ logger, operation: "list media" }, async (request) => {
  await requireAgent(request, "content:read");
  const url = new URL(request.url);
  const rawOffset = url.searchParams.get("offset");
  let offset = 0;
  if (rawOffset !== null && rawOffset !== "") {
    const value = Number(rawOffset);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return Response.json({ error: "Invalid offset: expected non-negative integer" }, { status: 400 });
    offset = value;
  }
  const status = url.searchParams.get("status");
  const parsedStatus = status === null ? null : mediaStatusSchema.safeParse(status);
  if (parsedStatus && !parsedStatus.success) return Response.json({ error: "Invalid status", details: parsedStatus.error.flatten().fieldErrors }, { status: 400 });
  const context = url.searchParams.get("context");
  const parsedContext = context === null ? null : mediaContextSchema.safeParse(context);
  if (parsedContext && !parsedContext.success) return Response.json({ error: "Invalid context", details: parsedContext.error.flatten().fieldErrors }, { status: 400 });
  const limit = parseAgentLimit(url.searchParams.get("limit"), 50);
  const rows = await listAgentMedia({ limit, offset, status: parsedStatus?.success ? parsedStatus.data : null, context: parsedContext?.success ? parsedContext.data : null, entityType: url.searchParams.get("entityType"), entityId: url.searchParams.get("entityId") });
  return Response.json({ data: rows, pagination: { limit, offset, hasMore: rows.length === limit } });
});
