import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { webhookLogs } from "@/lib/db/schema";
import { processPendingWebhooks } from "@/lib/webhook-processor";
import { UnsafeOutboundUrlError } from "@/lib/url-safety";
import { signPayload } from "@/lib/webhook-verify";
import { cleanTestData, createTestPlan, createTestServiceConfig } from "@/test/helpers";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/webhook-transport", () => ({ postWebhook: mocks.post }));
beforeEach(async () => { await cleanTestData(); vi.clearAllMocks(); });
afterAll(cleanTestData);

async function fixture() {
  const plan = await createTestPlan();
  const config = await createTestServiceConfig(plan.id, { apiKeyHash: "synthetic-signing-key" });
  await db.insert(webhookLogs).values({ serviceConfigId: config.id, eventType: "entitlement.granted", payloadJson: '{"user":"synthetic"}', idempotencyKey: crypto.randomUUID() });
}

describe("pinned webhook delivery lifecycle", () => {
  it.each([
    [204, "sent"], [400, "dead_letter"], [403, "dead_letter"],
    [503, "failed"], [307, "failed"],
  ])("preserves HTTP %i -> %s transition and signing contract", async (status, state) => {
    await fixture();
    mocks.post.mockResolvedValue({ ok: status === 204, status, text: "synthetic response" });
    await processPendingWebhooks();
    const [record] = await db.select().from(webhookLogs);
    expect(record).toMatchObject({ status: state, attempts: 1, httpStatus: status, lockedBy: null });
    const [url, options] = mocks.post.mock.calls[0]!;
    expect(url).toBe("https://example.com/webhook");
    expect(options.body).toBe('{"user":"synthetic"}');
    expect(options.headers["x-entitlement-event"]).toBe("entitlement.granted");
    expect(options.headers["x-entitlement-signature"]).toBe(signPayload("synthetic-signing-key", JSON.parse(options.body), options.headers["x-entitlement-timestamp"]));
  });

  it.each([
    { error: new UnsafeOutboundUrlError("non-public"), state: "dead_letter" },
    { error: new Error("timeout"), state: "failed" },
    { error: new Error("response exceeded limit"), state: "failed" },
  ])("handles a transport rejection as $state", async ({ error, state }) => {
    await fixture();
    mocks.post.mockRejectedValue(error);
    await processPendingWebhooks();
    const [record] = await db.select().from(webhookLogs);
    expect(record).toMatchObject({ status: state, attempts: 1, httpStatus: null, lockedBy: null });
  });
});
