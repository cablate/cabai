/**
 * discord.ts — Discord REST API client for role management.
 *
 * paid-service-site directly calls Discord API to add/remove roles.
 * No CabCrab webhook intermediary needed.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDiscordLinks } from "@/lib/db/schema";
import { getEntitledPlanIds } from "@/lib/access";
import { getSiteConfig } from "@/lib/site-config";
import { createLogger } from "@/lib/logger";

const logger = createLogger("discord");

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_REQUEST_TIMEOUT_MS = 8_000;

function getConfig() {
  return {
    botToken: process.env.DISCORD_BOT_TOKEN ?? "",
    guildId: process.env.DISCORD_GUILD_ID ?? "",
  };
}

// ─── Guild join (guilds.join OAuth2 scope) ───

/**
 * Add a Discord user to the configured guild using their OAuth2 access token.
 *
 * Requires the `guilds.join` scope in the OAuth authorization.
 * Uses the Bot token for authentication and the user's OAuth2 access_token
 * in the request body to authorize the guild membership.
 *
 * Returns true if the user is now in the guild (either added now or already a member).
 * Discord returns 201 (created) or 204 (already a member) on success.
 */
export async function addUserToGuild(
  discordUserId: string,
  oauthAccessToken: string,
): Promise<boolean> {
  const { botToken, guildId } = getConfig();
  if (!botToken || !guildId) return false;

  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: oauthAccessToken }),
        signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
      },
    );

    if (res.ok) {
      logger.info("User added to guild", { discordUserId, status: res.status });
      return true;
    }

    // 204 (No Content) = already a member — still a success
    if (res.status === 204) return true;

    logger.error("Failed to add user to guild", {
      discordUserId,
      status: res.status,
      body: await res.text().catch(() => "unknown"),
    });
    return false;
  } catch (err) {
    logger.error("Exception adding user to guild", {
      discordUserId,
      error: String(err),
    });
    return false;
  }
}

// ─── Low-level Discord REST API ───

async function discordFetch(
  path: string,
  method: "PUT" | "DELETE",
): Promise<{ ok: boolean; status: number; error?: string }> {
  const { botToken } = getConfig();
  if (!botToken) return { ok: false, status: 0, error: "Discord bot token is not configured." };

  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
    });
    // DELETE is idempotent for our cleanup contract. A missing member/role
    // already represents the desired state.
    return { ok: res.ok || (method === "DELETE" && res.status === 404), status: res.status };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      ok: false,
      status: 0,
      error: timedOut ? "Discord request timed out." : "Discord request failed.",
    };
  }
}

export async function addGuildMemberRole(
  discordUserId: string,
  roleId: string,
): Promise<boolean> {
  const { guildId } = getConfig();
  if (!guildId) return false;

  const { ok, status } = await discordFetch(
    `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    "PUT",
  );
  if (!ok) {
    logger.error("Failed to add role", { discordUserId, roleId, status });
  }
  return ok;
}

export async function removeGuildMemberRole(
  discordUserId: string,
  roleId: string,
): Promise<boolean> {
  const { guildId } = getConfig();
  if (!guildId) return false;

  const { ok, status } = await discordFetch(
    `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    "DELETE",
  );
  if (!ok) {
    logger.error("Failed to remove role", { discordUserId, roleId, status });
  }
  return ok;
}

// ─── High-level operations ───

export interface DiscordUserSyncResult {
  ok: boolean;
  skipped: "disabled" | "unlinked" | null;
  attempted: number;
  succeeded: number;
  failures: Array<{ roleId: string; status: number; error?: string }>;
}

/** Reconcile every managed role for a linked user from current entitlement. */
export async function syncDiscordRolesForUser(userId: string): Promise<DiscordUserSyncResult> {
  const { botToken, guildId } = getConfig();
  if (!botToken || !guildId) {
    return { ok: true, skipped: "disabled", attempted: 0, succeeded: 0, failures: [] };
  }

  const link = await db.query.userDiscordLinks.findFirst({
    where: and(eq(userDiscordLinks.userId, userId), isNull(userDiscordLinks.unlinkedAt)),
  });
  if (!link) {
    return { ok: true, skipped: "unlinked", attempted: 0, succeeded: 0, failures: [] };
  }

  const entitledPlanIds = await getEntitledPlanIds(userId);
  const allMappings = await db.query.discordRoleMappings.findMany();
  const mappingsByRole = new Map<string, typeof allMappings>();
  for (const mapping of allMappings) {
    const group = mappingsByRole.get(mapping.roleId) ?? [];
    group.push(mapping);
    mappingsByRole.set(mapping.roleId, group);
  }

  const operations: Array<{ roleId: string; method: "PUT" | "DELETE" }> = [];
  const defaultRoleId = await getSiteConfig("default_discord_role_id");
  if (defaultRoleId) {
    operations.push({ roleId: defaultRoleId, method: "PUT" });
  }
  for (const [roleId, mappings] of mappingsByRole) {
    if (roleId === defaultRoleId) continue;
    operations.push({
      roleId,
      method: mappings.some((mapping) => entitledPlanIds.has(mapping.planId)) ? "PUT" : "DELETE",
    });
  }

  const failures: DiscordUserSyncResult["failures"] = [];
  let succeeded = 0;
  for (const operation of operations) {
    const result = await discordFetch(
      `/guilds/${guildId}/members/${link.discordId}/roles/${operation.roleId}`,
      operation.method,
    );
    if (result.ok) succeeded++;
    else {
      failures.push({
        roleId: operation.roleId,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      });
    }
  }

  return {
    ok: failures.length === 0,
    skipped: null,
    attempted: operations.length,
    succeeded,
    failures,
  };
}

/** Backward-compatible wrapper; now performs desired-state reconciliation. */
export async function grantDiscordRolesForUser(userId: string): Promise<void> {
  const result = await syncDiscordRolesForUser(userId);
  if (!result.ok) throw new Error("Discord user role synchronization failed.");
}

/**
 * Grant Discord roles for a specific plan purchase.
 * Call this when a purchase is completed (callback or marketplace).
 */
export async function grantDiscordRolesForPlan(
  userId: string,
  planId: string,
): Promise<void> {
  const result = await syncDiscordRolesForPlan(userId, planId);
  if (!result.ok) throw new Error("Discord plan role synchronization failed.");
}

/**
 * Revoke Discord roles for a specific plan.
 * Call this on refund or access revocation.
 */
export async function revokeDiscordRolesForPlan(
  userId: string,
  planId: string,
): Promise<void> {
  const result = await syncDiscordRolesForPlan(userId, planId);
  if (!result.ok) throw new Error("Discord plan role synchronization failed.");
}

/** Remove every plan-managed role from a specific Discord account. */
export async function removeMappedDiscordRoles(
  discordUserId: string,
): Promise<DiscordUserSyncResult> {
  const { botToken, guildId } = getConfig();
  if (!botToken || !guildId) {
    return { ok: false, skipped: "disabled", attempted: 0, succeeded: 0, failures: [] };
  }
  const mappings = await db.query.discordRoleMappings.findMany({
    columns: { roleId: true },
  });
  const roleIds = [...new Set(mappings.map((mapping) => mapping.roleId))];
  const failures: DiscordUserSyncResult["failures"] = [];
  let succeeded = 0;
  for (const roleId of roleIds) {
    const result = await discordFetch(
      `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      "DELETE",
    );
    if (result.ok) succeeded++;
    else failures.push({ roleId, status: result.status, ...(result.error ? { error: result.error } : {}) });
  }
  return {
    ok: failures.length === 0,
    skipped: null,
    attempted: roleIds.length,
    succeeded,
    failures,
  };
}

export interface DiscordPlanSyncResult {
  ok: boolean;
  skipped: "disabled" | "unlinked" | "unmapped" | null;
  desired: "granted" | "revoked";
  attempted: number;
  succeeded: number;
  failures: Array<{ roleId: string; status: number; error?: string }>;
}

/**
 * Reconcile mapped plan roles from current local entitlement.
 *
 * Durable outbox consumers call this instead of replaying the historical event
 * literally. If a revoke committed after an older grant event, the current
 * entitlement wins and the stale grant cannot restore the role.
 */
export async function syncDiscordRolesForPlan(
  userId: string,
  planId: string,
): Promise<DiscordPlanSyncResult> {
  const { botToken, guildId } = getConfig();
  const entitledPlanIds = await getEntitledPlanIds(userId);
  const desired = entitledPlanIds.has(planId) ? "granted" as const : "revoked" as const;

  if (!botToken || !guildId) {
    return { ok: true, skipped: "disabled", desired, attempted: 0, succeeded: 0, failures: [] };
  }

  const link = await db.query.userDiscordLinks.findFirst({
    where: and(eq(userDiscordLinks.userId, userId), isNull(userDiscordLinks.unlinkedAt)),
  });
  if (!link) {
    return { ok: true, skipped: "unlinked", desired, attempted: 0, succeeded: 0, failures: [] };
  }

  const allMappings = await db.query.discordRoleMappings.findMany();
  const mappings = allMappings.filter((mapping) => mapping.planId === planId);
  if (mappings.length === 0) {
    return { ok: true, skipped: "unmapped", desired, attempted: 0, succeeded: 0, failures: [] };
  }

  const roleIds = [...new Set(mappings.map((mapping) => mapping.roleId))];
  const roles: Array<{ roleId: string; isDefault: boolean; method: "PUT" | "DELETE" }> =
    roleIds.map((roleId) => ({
      roleId,
      isDefault: false,
      // A shared Discord role remains present while any plan mapped to it is
      // entitled. Revoking one plan must not remove another plan's role.
      method: allMappings.some((mapping) =>
        mapping.roleId === roleId && entitledPlanIds.has(mapping.planId),
      ) ? "PUT" : "DELETE",
    }));
  if (entitledPlanIds.size > 0) {
    const defaultRoleId = await getSiteConfig("default_discord_role_id");
    if (defaultRoleId && !roles.some((role) => role.roleId === defaultRoleId)) {
      roles.unshift({ roleId: defaultRoleId, isDefault: true, method: "PUT" });
    }
  }

  const failures: DiscordPlanSyncResult["failures"] = [];
  let succeeded = 0;
  for (const role of roles) {
    const result = await discordFetch(
      `/guilds/${guildId}/members/${link.discordId}/roles/${role.roleId}`,
      role.method,
    );
    if (result.ok) {
      succeeded++;
    } else {
      failures.push({ roleId: role.roleId, status: result.status, ...(result.error ? { error: result.error } : {}) });
    }
  }

  if (failures.length > 0) {
    logger.error("Discord plan role synchronization failed", {
      userId,
      planId,
      desired,
      statuses: failures.map((failure) => failure.status),
    });
  } else {
    logger.info("Discord plan roles synchronized", { userId, planId, desired, roles: roles.length });
  }

  return {
    ok: failures.length === 0,
    skipped: null,
    desired,
    attempted: roles.length,
    succeeded,
    failures,
  };
}
