import { db } from "@/lib/db";
import { entitlementOutbox, webhookLogs, serviceConfigs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { WebhooksTable, type WebhookRow } from "./webhooks-table";

export default async function WebhooksPage() {
  const [webhookRows, transitionRows] = await Promise.all([
    db
      .select({
        id: webhookLogs.id,
        eventType: webhookLogs.eventType,
        status: webhookLogs.status,
        httpStatus: webhookLogs.httpStatus,
        attempts: webhookLogs.attempts,
        lastError: webhookLogs.lastError,
        createdAt: webhookLogs.createdAt,
        serviceName: serviceConfigs.serviceName,
      })
      .from(webhookLogs)
      .leftJoin(serviceConfigs, eq(webhookLogs.serviceConfigId, serviceConfigs.id))
      .orderBy(desc(webhookLogs.createdAt))
      .limit(200),
    db
      .select({
        id: entitlementOutbox.id,
        eventType: entitlementOutbox.eventType,
        status: entitlementOutbox.status,
        attempts: entitlementOutbox.attempts,
        lastError: entitlementOutbox.lastError,
        createdAt: entitlementOutbox.createdAt,
      })
      .from(entitlementOutbox)
      .orderBy(desc(entitlementOutbox.createdAt))
      .limit(200),
  ]);

  const logs: WebhookRow[] = [
    ...webhookRows.map((log) => ({
      ...log,
      kind: "webhook" as const,
      createdAt: log.createdAt.toISOString(),
    })),
    ...transitionRows.map((event) => ({
      ...event,
      kind: "entitlement" as const,
      httpStatus: null,
      serviceName: "權限／Discord",
      createdAt: event.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 200);

  const deadLetterCount = logs.filter((l) => l.status === "dead_letter").length;
  const pendingCount = logs.filter(
    (l) => l.status === "pending" || l.status === "failed",
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webhook 紀錄"
        actions={
          <div className="flex gap-3 text-sm">
            {deadLetterCount > 0 && (
              <Badge variant="danger">{deadLetterCount} dead letter</Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} pending</Badge>
            )}
          </div>
        }
      />
      <WebhooksTable data={logs} />
    </div>
  );
}
