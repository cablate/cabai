"use server";

import { requireAdminAction } from "@/lib/admin-action-guard";
import {
  AGENT_PERMISSION_OPTIONS,
  DEFAULT_AGENT_PERMISSIONS,
  generateApiKey,
  revokeApiKey,
  type AgentPermission,
} from "@/lib/agent-auth";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const permissionValues = AGENT_PERMISSION_OPTIONS.map((option) => option.value) as [
  AgentPermission,
  ...AgentPermission[],
];

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  permissions: z.array(z.enum(permissionValues)).min(1).default(DEFAULT_AGENT_PERMISSIONS),
  expiresInDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .nullable()
    .optional(),
});

export async function createApiKeyAction(input: {
  name: string;
  permissions: AgentPermission[];
  expiresInDays?: number | null;
}): Promise<{
  success: boolean;
  fullKey?: string;
  error?: string;
}> {
  try {
    const session = await requireAdminAction("api-key:create");
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: "Invalid API key settings" };
    }

    const { name, permissions, expiresInDays } = parsed.data;
    const { fullKey, keyId } = await generateApiKey(
      name,
      session.user.id,
      expiresInDays ?? undefined,
      permissions,
    );

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "create",
      entityType: "agentApiKey",
      entityId: keyId,
      metadata: { name, permissions, expiresInDays },
    });

    revalidatePath("/admin/api-keys");

    return { success: true, fullKey };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create API key",
    };
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await requireAdminAction("api-key:revoke");

    await revokeApiKey(keyId);

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "revoke_access",
      entityType: "agentApiKey",
      entityId: keyId,
    });

    revalidatePath("/admin/api-keys");

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to revoke API key",
    };
  }
}
