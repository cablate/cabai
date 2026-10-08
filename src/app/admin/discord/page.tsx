import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { discordRoleMappings, userDiscordLinks, plans, planPresentations, users } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { DiscordManager } from "./discord-manager";
import { getPlanDisplayName } from "@/lib/plan-display";
import { getSiteConfig } from "@/lib/site-config";

export default async function DiscordAdminPage() {
  // Fetch role mappings with plan display names
  const mappings = await db
    .select({
      id: discordRoleMappings.id,
      planId: discordRoleMappings.planId,
      planName: plans.name,
      presentationTitle: planPresentations.title,
      roleId: discordRoleMappings.roleId,
      roleName: discordRoleMappings.roleName,
      createdAt: discordRoleMappings.createdAt,
    })
    .from(discordRoleMappings)
    .leftJoin(plans, eq(discordRoleMappings.planId, plans.id))
    .leftJoin(planPresentations, eq(discordRoleMappings.planId, planPresentations.planId))
    .orderBy(desc(discordRoleMappings.createdAt));

  // Fetch linked users with user info
  const linkedUsers = await db
    .select({
      id: userDiscordLinks.id,
      userId: userDiscordLinks.userId,
      userName: users.name,
      userEmail: users.email,
      discordId: userDiscordLinks.discordId,
      discordUsername: userDiscordLinks.discordUsername,
      linkedAt: userDiscordLinks.linkedAt,
    })
    .from(userDiscordLinks)
    .leftJoin(users, eq(userDiscordLinks.userId, users.id))
    .orderBy(desc(userDiscordLinks.linkedAt));

  // Fetch all active plans with display names for mapping form
  const allPlansRaw = await db
    .select({ id: plans.id, name: plans.name, presentationTitle: planPresentations.title })
    .from(plans)
    .leftJoin(planPresentations, eq(plans.id, planPresentations.planId))
    .where(eq(plans.status, "active"))
    .orderBy(plans.name);
  const allPlans = allPlansRaw.map((p) => ({
    id: p.id,
    name: getPlanDisplayName(p.name, p.presentationTitle),
  }));

  // Check if Discord is configured
  const configured = !!(
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_GUILD_ID &&
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET
  );

  // Read the default free member role from site_config
  const defaultRoleId = await getSiteConfig("default_discord_role_id");

  // Serialize dates
  const serializedMappings = mappings.map((m) => ({
    ...m,
    planName: getPlanDisplayName(m.planName || "Unknown", m.presentationTitle),
    createdAt: m.createdAt.toISOString(),
  }));

  const serializedLinkedUsers = linkedUsers.map((u) => ({
    ...u,
    linkedAt: u.linkedAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Discord 整合"
        description="管理 Discord 角色映射與帳號連結。購買對應 Plan 的使用者會自動獲得 Discord 角色，連結 Discord 後即時生效。"
      />
      <DiscordManager
        mappings={serializedMappings}
        linkedUsers={serializedLinkedUsers}
        plans={allPlans}
        configured={configured}
        defaultRoleId={defaultRoleId}
      />
    </div>
  );
}
