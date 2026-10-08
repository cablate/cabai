import { requireAgent, parseAgentLimit } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { listAgentWebhooks } from "@/lib/services/agent-operations-service";
import type { webhookLogs } from "@/lib/db/schema";

const logger = createLogger("agent-webhooks-list");
const ALLOWED_STATUSES = new Set(["pending", "processing", "sent", "failed", "dead_letter"] as const);
type WebhookStatus = typeof webhookLogs.status.enumValues[number];
export const GET = withApiHandler({ logger, operation: "list webhooks", internalError: "Server error" }, async (request) => {
  await requireAgent(request, "webhooks:read");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !ALLOWED_STATUSES.has(status as WebhookStatus)) return Response.json({ error: `Invalid status. Expected one of: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
  return Response.json({ data: await listAgentWebhooks({ status: status as WebhookStatus | null, limit: parseAgentLimit(url.searchParams.get("limit")) }) });
});
