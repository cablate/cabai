/**
 * Tests for Discord role management with default free member role.
 *
 * Real DB, mocks: site-config, Discord REST API via global.fetch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestOrder,
  createTestPlan,
  createTestPurchase,
  createTestUser,
  cleanTestData,
} from "@/test/helpers";
import { db } from "@/lib/db";
import { userDiscordLinks, discordRoleMappings } from "@/lib/db/schema";

// ─── Mocks ───

vi.mock("@/lib/site-config", () => ({
  getSiteConfig: vi.fn(),
  setSiteConfig: vi.fn(),
  deleteSiteConfig: vi.fn(),
}));

// Import after mocks
import { getSiteConfig } from "@/lib/site-config";
import {
  grantDiscordRolesForUser,
  grantDiscordRolesForPlan,
  syncDiscordRolesForPlan,
  syncDiscordRolesForUser,
} from "@/lib/discord";

const mockGetSiteConfig = getSiteConfig as unknown as ReturnType<typeof vi.fn>;

function mockDiscordApiSuccess() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
  }));
}

describe("grantDiscordRolesForUser (default role)", () => {
  let userId: string;
  const discordId = "123456789012345678";

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    // Insert a Discord link for this user
    await db.insert(userDiscordLinks).values({
      userId,
      discordId,
      discordUsername: "testuser",
    });
  });

  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscordApiSuccess();
    vi.stubEnv("DISCORD_BOT_TOKEN", "test_bot_token");
    vi.stubEnv("DISCORD_GUILD_ID", "test_guild_id");
  });

  it("1a: grants default role when configured and user has no purchases", async () => {
    mockGetSiteConfig.mockResolvedValue("default_role_123");

    await grantDiscordRolesForUser(userId);

    // Should have called Discord API with the default role ID
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/guilds/test_guild_id/members/${discordId}/roles/default_role_123`),
      expect.objectContaining({ method: "PUT" }),
    );
    // Only one PUT call — no plan-bound roles to grant
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("1b: does NOT grant default role when not configured", async () => {
    mockGetSiteConfig.mockResolvedValue(null);

    await grantDiscordRolesForUser(userId);

    // Should not call Discord API at all since there are no plan roles either
    expect(fetch).not.toHaveBeenCalled();
  });

  it("1c: returns early when Discord bot token is missing", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");

    await grantDiscordRolesForUser(userId);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("1d: returns early when no discord link exists", async () => {
    const nonExistentUserId = "00000000-0000-0000-0000-000000000000";

    await grantDiscordRolesForUser(nonExistentUserId);

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("grantDiscordRolesForPlan (default role)", () => {
  let userId: string;
  let planId: string;
  const discordId = "876543210987654321";

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    // Create a test plan using the test helper
    const { id } = await createTestPlan({
      name: "test-discord-plan",
      slug: `test-discord-plan-${Date.now()}`,
    });
    planId = id;
    const order = await createTestOrder(userId, planId, { status: "completed" });
    await createTestPurchase(userId, planId, order.id);

    // Create a role mapping for this plan
    await db.insert(discordRoleMappings).values({
      planId,
      roleId: "plan_role_456",
      roleName: "Test Plan Role",
    });

    // Insert a Discord link for this user
    await db.insert(userDiscordLinks).values({
      userId,
      discordId,
      discordUsername: "testuser2",
    });
  });

  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscordApiSuccess();
    vi.stubEnv("DISCORD_BOT_TOKEN", "test_bot_token");
    vi.stubEnv("DISCORD_GUILD_ID", "test_guild_id");
  });

  it("2a: grants default role alongside plan role when default is configured", async () => {
    mockGetSiteConfig.mockResolvedValue("default_role_789");

    await grantDiscordRolesForPlan(userId, planId);

    // Should have called Discord API for both default role and plan role
    const allCalls = (fetch as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string, RequestInit]>;
    const urls = allCalls.map((c) => c[0]);

    expect(urls.some((u) => u.includes("/roles/default_role_789"))).toBe(true);
    expect(urls.some((u) => u.includes("/roles/plan_role_456"))).toBe(true);
    expect(allCalls.length).toBe(2);
  });

  it("2b: grants plan role when default is not configured", async () => {
    mockGetSiteConfig.mockResolvedValue(null);

    await grantDiscordRolesForPlan(userId, planId);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/roles/plan_role_456"),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("2c: returns early when discord link does not exist", async () => {
    const nonExistentUserId = "00000000-0000-0000-0000-000000000000";

    await grantDiscordRolesForPlan(nonExistentUserId, planId);

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Discord desired-state reconciliation", () => {
  beforeEach(async () => {
    await cleanTestData();
    vi.clearAllMocks();
    mockDiscordApiSuccess();
    mockGetSiteConfig.mockResolvedValue(null);
    vi.stubEnv("DISCORD_BOT_TOKEN", "test_bot_token");
    vi.stubEnv("DISCORD_GUILD_ID", "test_guild_id");
  });

  it("keeps a shared role when another mapped plan is still entitled", async () => {
    const user = await createTestUser();
    const ownedPlan = await createTestPlan({ name: "Owned shared-role plan" });
    const revokedPlan = await createTestPlan({ name: "Revoked shared-role plan" });
    const order = await createTestOrder(user.id, ownedPlan.id, { status: "completed" });
    await createTestPurchase(user.id, ownedPlan.id, order.id);
    await db.insert(discordRoleMappings).values([
      { planId: ownedPlan.id, roleId: "shared_role", roleName: "Paid member" },
      { planId: revokedPlan.id, roleId: "shared_role", roleName: "Paid member" },
    ]);
    await db.insert(userDiscordLinks).values({
      userId: user.id,
      discordId: "shared-role-user",
    });

    const result = await syncDiscordRolesForPlan(user.id, revokedPlan.id);

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/roles/shared_role"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("removes mapped roles that have no current entitlement", async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({ name: "Stale role plan" });
    await db.insert(discordRoleMappings).values({
      planId: plan.id,
      roleId: "stale_role",
      roleName: "Stale",
    });
    await db.insert(userDiscordLinks).values({
      userId: user.id,
      discordId: "stale-role-user",
    });

    const result = await syncDiscordRolesForUser(user.id);

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/roles/stale_role"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
