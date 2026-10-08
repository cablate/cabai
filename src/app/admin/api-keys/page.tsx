import { db } from "@/lib/db";
import { agentApiKeys } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { ApiKeyManager } from "./api-key-manager";

export default async function ApiKeysPage() {
  const keys = await db
    .select({
      id: agentApiKeys.id,
      name: agentApiKeys.name,
      keyPrefix: agentApiKeys.keyPrefix,
      permissions: agentApiKeys.permissions,
      lastUsedAt: agentApiKeys.lastUsedAt,
      expiresAt: agentApiKeys.expiresAt,
      revokedAt: agentApiKeys.revokedAt,
      createdAt: agentApiKeys.createdAt,
    })
    .from(agentApiKeys)
    .orderBy(desc(agentApiKeys.createdAt));

  const serialized = keys.map((k) => ({
    ...k,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="API 金鑰"
        description="管理自動化與 Agent 存取所使用的權限範圍金鑰。"
      />
      <ApiKeyManager keys={serialized} />
    </div>
  );
}
