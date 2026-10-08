import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runJob: vi.fn(),
  assertCronAuth: vi.fn(),
}));

vi.mock("@/lib/jobs/runner", () => ({ runJob: mocks.runJob }));
vi.mock("@/lib/cron-auth", () => ({ assertCronAuth: mocks.assertCronAuth }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

const { POST: reconcile } = await import("./reconcile/route");
const { POST: processWebhooks } = await import("./process-webhooks/route");
const { POST: cleanupOrders } = await import("./cleanup-orders/route");
const { POST: providerSync } = await import("./provider-sync/route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertCronAuth.mockReturnValue(null);
  mocks.runJob.mockResolvedValue({ executed: true, result: {} });
});

describe("external cron trigger context", () => {
  it.each([
    ["reconcile", reconcile, "subscription-reconciliation", undefined, "cron.reconcile"],
    ["process-webhooks", processWebhooks, "webhook-outbox", { limit: 25 }, "cron.process-webhooks"],
    ["cleanup-orders", cleanupOrders, "cleanup-orders", undefined, "cron.cleanup-orders"],
    ["provider-sync", providerSync, "provider-sync", { limit: 1 }, "cron.provider-sync"],
  ] as const)("marks %s as an external cron run", async (_name, handler, jobId, input, triggerId) => {
    const suffix = _name === "process-webhooks" ? "?limit=25" : "";
    const response = await handler(new Request(`https://example.com/api/cron/${_name}${suffix}`, {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.runJob).toHaveBeenCalledWith(jobId, input, {
      trigger: "external_cron",
      triggerId,
    });
    expect(triggerId).toMatch(/^[a-z0-9.-]+$/);
  });

  it("preserves cron authentication before invoking the runner", async () => {
    const rejected = Response.json({ error: "Unauthorized" }, { status: 401 });
    mocks.assertCronAuth.mockReturnValue(rejected);

    const response = await cleanupOrders(new Request("https://example.com/api/cron/cleanup-orders", {
      method: "POST",
    }));

    expect(response.status).toBe(401);
    expect(mocks.runJob).not.toHaveBeenCalled();
  });

  it("rejects an invalid provider-sync batch limit before invoking the runner", async () => {
    const response = await providerSync(new Request("https://example.com/api/cron/provider-sync?limit=11", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(400);
    expect(mocks.runJob).not.toHaveBeenCalled();
  });
});
