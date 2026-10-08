"use server";

import { eq, and, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { db } from "@/lib/db";
import { discordRoleMappings, plans, userDiscordLinks } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/audit";
import {
  removeGuildMemberRole,
  removeMappedDiscordRoles,
  syncDiscordRolesForPlan,
  syncDiscordRolesForUser,
} from "@/lib/discord";
import { getSiteConfig, setSiteConfig, deleteSiteConfig } from "@/lib/site-config";
import { getEntitledPlanIds } from "@/lib/access";
import { enqueueDiscordRoleSyncForUser } from "@/lib/entitlement-transitions";

export async function createRoleMappingAction(
  planId: string,
  roleId: string,
  roleName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("discord-role-mapping:create");

    if (!planId.trim() || !roleId.trim()) {
      return { success: false, error: "Plan 和 Discord Role ID 都必填" };
    }

    // Verify plan exists
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      columns: { id: true, name: true },
    });
    if (!plan) {
      return { success: false, error: "找不到對應的 Plan" };
    }

    // Check for duplicate plan+role combination
    const existing = await db.query.discordRoleMappings.findFirst({
      where: and(
        eq(discordRoleMappings.planId, planId),
        eq(discordRoleMappings.roleId, roleId.trim()),
      ),
    });
    if (existing) {
      return { success: false, error: "此 Plan 已有相同的 Discord 角色映射" };
    }

    const [mapping] = await db
      .insert(discordRoleMappings)
      .values({
        planId,
        roleId: roleId.trim(),
        roleName: roleName.trim() || null,
      })
      .returning({ id: discordRoleMappings.id });

    if (mapping) {
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "create",
        entityType: "discordRoleMapping",
        entityId: mapping.id,
        metadata: { planId, planName: plan.name, roleId: roleId.trim(), roleName: roleName.trim() },
      });

      const links = await db.query.userDiscordLinks.findMany({
        where: isNull(userDiscordLinks.unlinkedAt),
        columns: { userId: true },
      });
      for (const link of links) {
        await enqueueDiscordRoleSyncForUser({
          userId: link.userId,
          triggeredBy: `discord.mapping-create:${mapping.id}`,
        });
      }
    }

    revalidatePath("/admin/discord");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "建立失敗" };
  }
}

export async function deleteRoleMappingAction(
  mappingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("discord-role-mapping:delete");

    const mapping = await db.query.discordRoleMappings.findFirst({
      where: eq(discordRoleMappings.id, mappingId),
    });
    if (!mapping) {
      return { success: false, error: "找不到映射" };
    }

    // Remove the managed role before forgetting its ID. If another mapping or
    // the default-role policy still needs it, preserve it for that user.
    const defaultRoleId = await getSiteConfig("default_discord_role_id");
    if (mapping.roleId !== defaultRoleId) {
      const [otherMappings, links] = await Promise.all([
        db.query.discordRoleMappings.findMany({
          where: and(
            eq(discordRoleMappings.roleId, mapping.roleId),
            ne(discordRoleMappings.id, mapping.id),
          ),
        }),
        db.query.userDiscordLinks.findMany({
          where: isNull(userDiscordLinks.unlinkedAt),
        }),
      ]);
      for (const link of links) {
        const entitled = await getEntitledPlanIds(link.userId);
        const keep = otherMappings.some((candidate) => entitled.has(candidate.planId));
        if (!keep && !(await removeGuildMemberRole(link.discordId, mapping.roleId))) {
          return {
            success: false,
            error: "Discord 身分組清理失敗；映射尚未刪除，請稍後重試。",
          };
        }
      }
    }

    await db
      .delete(discordRoleMappings)
      .where(eq(discordRoleMappings.id, mappingId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "delete",
      entityType: "discordRoleMapping",
      entityId: mappingId,
      metadata: { planId: mapping.planId, roleId: mapping.roleId },
    });

    revalidatePath("/admin/discord");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "刪除失敗" };
  }
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

/**
 * Fetch all roles from the Discord guild for the role picker dropdown.
 * Filters out @everyone and managed bot roles.
 */
export async function fetchDiscordGuildRoles(): Promise<{
  roles: DiscordRole[];
  error?: string;
}> {
  try {
    await requireAdminAction("discord:guild-roles:fetch");

    const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_MAIN_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!botToken || !guildId) {
      return { roles: [], error: "Discord 尚未設定（缺少 BOT_TOKEN 或 GUILD_ID）" };
    }

    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
      next: { revalidate: 60 }, // cache for 60s
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return { roles: [], error: `Discord API 錯誤：${res.status}` };
    }

    const rawRoles = (await res.json()) as Array<{
      id: string;
      name: string;
      color: number;
      position: number;
      managed: boolean;
    }>;

    // Filter out @everyone (position 0) and bot-managed roles, sort by position desc
    const roles: DiscordRole[] = rawRoles
      .filter((r) => r.name !== "@everyone" && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        managed: r.managed,
      }));

    return { roles };
  } catch (err) {
    return { roles: [], error: err instanceof Error ? err.message : "載入失敗" };
  }
}

export async function unlinkUserDiscordAction(
  linkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("discord-user:unlink");

    const link = await db.query.userDiscordLinks.findFirst({
      where: eq(userDiscordLinks.id, linkId),
    });
    if (!link) {
      return { success: false, error: "找不到連結" };
    }

    const cleanup = await removeMappedDiscordRoles(link.discordId);
    if (!cleanup.ok) {
      return {
        success: false,
        error: "Discord 身分組清理失敗；連結仍保留，請稍後重試。",
      };
    }

    await db
      .update(userDiscordLinks)
      .set({ unlinkedAt: new Date() })
      .where(eq(userDiscordLinks.id, linkId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "unlink",
      entityType: "userDiscordLink",
      entityId: linkId,
      metadata: { userId: link.userId, discordId: link.discordId },
    });

    revalidatePath("/admin/discord");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "解除連結失敗" };
  }
}

/**
 * Reconcile this plan's managed roles for every active Discord link.
 */
export async function syncDiscordRolesForPlanAction(
  planId: string,
): Promise<{ success: boolean; synced: number; error?: string }> {
  try {
    const session = await requireAdminAction("discord-role-mapping:sync", { heavy: true });

    const links = await db.query.userDiscordLinks.findMany({
      where: isNull(userDiscordLinks.unlinkedAt),
      columns: { userId: true },
    });
    const userIds = [...new Set(links.map((link) => link.userId))];
    let synced = 0;
    let failed = 0;

    for (const userId of userIds) {
      const result = await syncDiscordRolesForPlan(userId, planId);
      if (result.ok && result.skipped === null) synced++;
      else failed++;
    }

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "sync",
      entityType: "discordRoleMapping",
      entityId: planId,
      metadata: { planId, syncedUsers: synced, failedUsers: failed },
    });

    return {
      success: failed === 0,
      synced,
      error: failed > 0 ? `${failed} 位使用者同步失敗，請稍後重試。` : undefined,
    };
  } catch (err) {
    return { success: false, synced: 0, error: err instanceof Error ? err.message : "同步失敗" };
  }
}

/**
 * Update the default free member role ID in site_config.
 * Pass an empty string to clear the setting.
 */
export async function updateDefaultDiscordRoleAction(
  roleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("discord:default-role:update");

    const previousRoleId = await getSiteConfig("default_discord_role_id");
    const links = await db.query.userDiscordLinks.findMany({
      where: isNull(userDiscordLinks.unlinkedAt),
      columns: { userId: true, discordId: true },
    });

    if (previousRoleId && previousRoleId !== roleId) {
      const sharedMappings = await db.query.discordRoleMappings.findMany({
        where: eq(discordRoleMappings.roleId, previousRoleId),
      });
      for (const link of links) {
        const entitled = await getEntitledPlanIds(link.userId);
        const keep = sharedMappings.some((mapping) => entitled.has(mapping.planId));
        if (!keep && !(await removeGuildMemberRole(link.discordId, previousRoleId))) {
          return {
            success: false,
            error: "舊的預設身分組清理失敗；設定尚未變更，請稍後重試。",
          };
        }
      }
    }

    if (roleId === "") {
      await deleteSiteConfig("default_discord_role_id");
    } else {
      await setSiteConfig("default_discord_role_id", roleId);
    }

    let failed = 0;
    for (const link of links) {
      const result = await syncDiscordRolesForUser(link.userId);
      if (!result.ok || result.skipped !== null) failed++;
    }

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: roleId === "" ? "delete" : "update",
      entityType: "siteConfig",
      entityId: "default_discord_role_id",
      metadata: { roleId: roleId || null, failedUsers: failed },
    });

    revalidatePath("/admin/discord");
    return {
      success: failed === 0,
      error: failed > 0 ? `${failed} 位使用者同步失敗；設定已保存，請重試同步。` : undefined,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新失敗" };
  }
}

/**
 * Read the current default free member role ID from site_config.
 */
export async function getDefaultDiscordRoleAction(): Promise<{
  roleId: string | null;
}> {
  await requireAdminAction("discord:default-role:read");
  const roleId = await getSiteConfig("default_discord_role_id");
  return { roleId };
}
