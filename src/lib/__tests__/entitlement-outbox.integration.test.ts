import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  discordRoleMappings,
  entitlementOutbox,
  userDiscordLinks,
  webhookLogs,
} from "@/lib/db/schema";
import { completeOrder } from "@/lib/order-lifecycle";
import { processPendingEntitlementOutbox } from "@/lib/entitlement-outbox-processor";
import { revokeOrderEntitlement } from "@/lib/entitlement-transitions";
import {
  cleanTestData,
  createTestOrder,
  createTestPlan,
  createTestServiceConfig,
  createTestUser,
} from "@/test/helpers";

vi.mock("@/lib/portaly", () => ({
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteConfig: vi.fn().mockResolvedValue(null),
}));

beforeEach(async () => {
  await cleanTestData();
  vi.clearAllMocks();
  vi.stubEnv("DISCORD_BOT_TOKEN", "test-token");
  vi.stubEnv("DISCORD_GUILD_ID", "test-guild");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await cleanTestData();
});

async function entitlementFixture() {
  const user = await createTestUser({ email: `test-outbox-${crypto.randomUUID()}@example.com` });
  const plan = await createTestPlan({ name: "Outbox plan" });
  const order = await createTestOrder(user.id, plan.id, { status: "pending" });
  await db.insert(userDiscordLinks).values({
    userId: user.id,
    discordId: "discord-test-user",
    discordUsername: "outbox-user",
  });
  await db.insert(discordRoleMappings).values({
    planId: plan.id,
    roleId: "role-123",
    roleName: "Outbox Role",
  });
  return { user, plan, order };
}

describe("durable entitlement outbox", () => {
  it("commits the grant transition with order completion", async () => {
    const { user, plan, order } = await entitlementFixture();

    await completeOrder(order.id, user.id, plan.id, {
      paidAmount: 1_500,
      triggeredBy: "test.callback",
    });

    const events = await db.select().from(entitlementOutbox);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "entitlement.granted",
      userId: user.id,
      planId: plan.id,
      orderId: order.id,
      status: "pending",
    });
  });

  it("retries Discord independently without duplicating external webhook rows", async () => {
    const { user, plan, order } = await entitlementFixture();
    await createTestServiceConfig(plan.id);
    await completeOrder(order.id, user.id, plan.id, {
      paidAmount: 1_500,
      triggeredBy: "test.callback",
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await processPendingEntitlementOutbox({ workerId: "worker-first" });
    expect(first.failed).toBe(1);

    const [failedEvent] = await db.select().from(entitlementOutbox);
    expect(failedEvent).toMatchObject({
      status: "failed",
      webhookEnqueuedAt: expect.any(Date),
      discordSyncedAt: null,
    });
    expect(await db.select().from(webhookLogs)).toHaveLength(1);

    await db.update(entitlementOutbox).set({ nextRetryAt: null }).where(eq(entitlementOutbox.id, failedEvent!.id));
    const second = await processPendingEntitlementOutbox({ workerId: "worker-second" });
    expect(second.delivered).toBe(1);
    expect(await db.select().from(webhookLogs)).toHaveLength(1);
  });

  it("processes an older grant according to the newer revoked entitlement state", async () => {
    const { user, plan, order } = await entitlementFixture();
    await completeOrder(order.id, user.id, plan.id, {
      paidAmount: 1_500,
      triggeredBy: "test.callback",
    });
    await revokeOrderEntitlement({
      orderId: order.id,
      source: "payment",
      triggeredBy: "test.refund",
      revokedBy: "test.refund",
      orderChanges: { status: "refunded", refundedAt: new Date() },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await processPendingEntitlementOutbox({ limit: 10, workerId: "worker-stale-grant" });

    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
    expect(methods).not.toContain("PUT");
    expect(methods).toEqual(["DELETE", "DELETE"]);
    expect(await db.select().from(entitlementOutbox)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "entitlement.granted", status: "delivered" }),
        expect.objectContaining({ eventType: "entitlement.revoked", status: "delivered" }),
      ]),
    );
  });
});
