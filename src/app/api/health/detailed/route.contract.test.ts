import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectConfig: vi.fn(),
  inspectSchema: vi.fn(),
  inspectJobs: vi.fn(),
  inspectSyncQueue: vi.fn(),
  assertCronAuth: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/config/platform", () => ({ inspectPlatformConfig: mocks.inspectConfig }));
vi.mock("@/lib/schema-readiness", () => ({ inspectSchemaReadiness: mocks.inspectSchema }));
vi.mock("@/lib/jobs/freshness", () => ({ inspectJobFreshness: mocks.inspectJobs }));
vi.mock("@/lib/provider-sync-ledger", () => ({
  inspectProviderSyncQueue: mocks.inspectSyncQueue,
  providerSyncHealthStatus: (health: { oldestQueuedAgeMs: number | null; expiredLeaseCount: number }) => (
    health.expiredLeaseCount > 0 || (health.oldestQueuedAgeMs !== null && health.oldestQueuedAgeMs > 15 * 60_000)
      ? "degraded"
      : "ok"
  ),
}));
vi.mock("@/lib/cron-auth", () => ({ assertCronAuth: mocks.assertCronAuth }));
vi.mock("@/lib/api-route", () => ({ withApiHandler: (_options: unknown, handler: unknown) => handler }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: mocks.loggerError }),
}));

function inspection(diagnostics: Array<{ level: "error"; impact: "fatal" | "degraded"; key: string; message: string }> = []) {
  return {
    diagnostics,
    capabilities: {
      storage: { state: "enabled", provider: "local", missing: [], notes: [] },
      backup: { state: "disabled", provider: "disabled", missing: [], notes: [] },
      scheduledTasks: { state: "disabled", provider: "disabled", missing: [], notes: [] },
      discord: { state: "disabled", provider: "discord", missing: [], notes: [] },
      agentApi: { state: "disabled", provider: "agent-api", missing: [], notes: [] },
      payment: { state: "disabled", provider: "portaly", missing: [], notes: [] },
    },
    values: {},
  };
}

async function call(url = "http://localhost/api/health/detailed") {
  const { GET } = await import("./route");
  return GET(new Request(url, { headers: { Authorization: "Bearer test" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertCronAuth.mockReturnValue(null);
  mocks.inspectConfig.mockReturnValue(inspection());
  mocks.inspectSchema.mockResolvedValue({
    current: true,
    code: "SCHEMA_CURRENT",
    requiredTag: "0012_example",
    hashStatus: "exact",
  });
  mocks.inspectJobs.mockResolvedValue([]);
  mocks.inspectSyncQueue.mockResolvedValue({
    queuedCount: 0,
    runningCount: 0,
    oldestQueuedAt: null,
    oldestRunningAt: null,
    oldestQueuedAgeMs: null,
    oldestRunningAgeMs: null,
    expiredLeaseCount: 0,
    oldestExpiredLeaseAgeMs: null,
    observedAt: "2026-09-27T00:00:00.000Z",
  });
});

describe("authenticated operational readiness", () => {
  it("returns a current-schema operational envelope", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      db: "connected",
      schema: { status: "current", requiredTag: "0012_example" },
      config: { status: "ok", fatal: [], degraded: [] },
      operational: { status: "ok", degraded: [] },
      providerSyncQueue: { status: "ok", queuedCount: 0, runningCount: 0 },
    });
  });

  it("alerts on optional degradation while core container scope stays serviceable", async () => {
    mocks.inspectConfig.mockReturnValue(inspection([{
      level: "error",
      impact: "degraded",
      key: "backup",
      message: "redacted",
    }]));

    const operations = await call();
    const core = await call("http://localhost/api/health/detailed?scope=core");

    expect(operations.status).toBe(503);
    expect(core.status).toBe(200);
    await expect(core.json()).resolves.toMatchObject({
      status: "degraded",
      config: { status: "degraded", degraded: ["backup"] },
    });
  });

  it("always rejects a stale schema, including core container scope", async () => {
    mocks.inspectSchema.mockResolvedValue({
      current: false,
      code: "SCHEMA_NOT_CURRENT",
      requiredTag: "0012_example",
    });

    const response = await call("http://localhost/api/health/detailed?scope=core");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      schema: { status: "stale", code: "SCHEMA_NOT_CURRENT" },
    });
  });

  it("returns operational 503 when an enabled job is stale", async () => {
    const enabled = inspection();
    enabled.capabilities.scheduledTasks = { state: "enabled", provider: "external", missing: [], notes: [] };
    mocks.inspectConfig.mockReturnValue(enabled);
    mocks.inspectJobs.mockResolvedValue([{
      jobId: "webhook-outbox",
      state: "stale",
      code: "JOB_SUCCESS_STALE",
      thresholdSeconds: 900,
      ageSeconds: 901,
    }]);

    const response = await call();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      scheduler: { mode: "external", jobs: [expect.objectContaining({ jobId: "webhook-outbox" })] },
    });
  });

  it.each([
    ["an expired lease", {
      queuedCount: 0,
      runningCount: 1,
      oldestQueuedAt: null,
      oldestRunningAt: "2026-09-27T00:00:00.000Z",
      oldestQueuedAgeMs: null,
      oldestRunningAgeMs: 120_000,
      expiredLeaseCount: 1,
      oldestExpiredLeaseAgeMs: 1,
      observedAt: "2026-09-27T00:02:00.000Z",
    }, "provider_sync_expired_lease"],
    ["an overdue queued job", {
      queuedCount: 1,
      runningCount: 0,
      oldestQueuedAt: "2026-09-27T00:00:00.000Z",
      oldestRunningAt: null,
      oldestQueuedAgeMs: 15 * 60_000 + 1,
      oldestRunningAgeMs: null,
      expiredLeaseCount: 0,
      oldestExpiredLeaseAgeMs: null,
      observedAt: "2026-09-27T00:15:00.001Z",
    }, "provider_sync_queue_stale"],
  ])("alerts on provider sync queue health for %s", async (_name, health, degradedKey) => {
    mocks.inspectSyncQueue.mockResolvedValue(health);

    const response = await call();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      operational: { status: "degraded", degraded: [degradedKey] },
      providerSyncQueue: { status: "degraded", ...health },
    });
  });
});
