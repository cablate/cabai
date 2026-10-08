import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestUser, createTestPlan, createTestServiceConfig, cleanTestData } from "@/test/helpers";
import { enqueueEntitlementWebhooks } from "@/lib/webhook-outbox";
import type { EntitlementEvent } from "@/lib/webhook-outbox";
import { db } from "@/lib/db";
import { webhookLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/portaly", () => ({
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  PORTALY_MODE: "test",
  verifyCallback: vi.fn(),
}));

let userId: string;
let userEmail: string;
let planId: string;
let serviceConfigId: string;

beforeAll(async () => {
  await cleanTestData();
  const user = await createTestUser({ email: "test-webhook@example.com" });
  userId = user.id;
  userEmail = user.email;
  const plan = await createTestPlan({ name: "Webhook Test Plan" });
  planId = plan.id;
  const config = await createTestServiceConfig(planId);
  serviceConfigId = config.id;
});

afterAll(async () => {
  await cleanTestData();
});

function makeEvent(overrides: Partial<EntitlementEvent> = {}): EntitlementEvent {
  return {
    eventType: "entitlement.granted",
    userId,
    userEmail,
    planId,
    planName: "Webhook Test Plan",
    billingPeriod: "monthly",
    orderId: "order-test-001",
    source: "one-time",
    grantedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("Webhook Outbox / Enqueue (E14)", () => {
  it("E14a: enqueue creates webhook log entry", async () => {
    const event = makeEvent();
    const result = await enqueueEntitlementWebhooks(event);

    expect(result.matchedServices).toBe(1);
    expect(result.enqueued).toBe(1);

    const logs = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.serviceConfigId, serviceConfigId));
    expect(logs.length).toBe(1);
    expect(logs[0]!.eventType).toBe("entitlement.granted");
    expect(logs[0]!.status).toBe("pending");
  });

  it("E14b: duplicate event → idempotent, no second log entry", async () => {
    const event = makeEvent();
    const result = await enqueueEntitlementWebhooks(event);

    expect(result.enqueued).toBe(1);

    const logs = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.serviceConfigId, serviceConfigId));
    expect(logs.length).toBe(1);
  });

  it("E14c: different orderId → different idempotency key → new log entry", async () => {
    const event = makeEvent({ orderId: "order-test-002" });
    const result = await enqueueEntitlementWebhooks(event);

    expect(result.enqueued).toBe(1);

    const logs = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.serviceConfigId, serviceConfigId));
    expect(logs.length).toBe(2);
  });
});
