import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAgent: vi.fn(), getOverview: vi.fn() }));
vi.mock("@/lib/agent-auth", () => ({ requireAgent: mocks.requireAgent }));
vi.mock("@/lib/admin-operations", () => ({ getAdminOperationsOverview: mocks.getOverview }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { GET } from "./route";

describe("Agent operations overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgent.mockResolvedValue({ agentId: "agent-1" });
    mocks.getOverview.mockResolvedValue({
      urgent: [],
      work: [],
      total: 0,
      status: "ok",
      completeness: "complete",
      unavailableSignals: [],
      observedAt: "2026-09-27T00:00:00.000Z",
    });
  });

  it("uses the dedicated read scope and returns freshness metadata", async () => {
    const response = await GET(new Request("https://example.test/api/agent/operations/overview"));
    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "system:read");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      total: 0,
      status: "ok",
      completeness: "complete",
      unavailableSignals: [],
    });
    expect(Date.parse(body.data.observedAt)).not.toBeNaN();
  });

  it("preserves partial-source status instead of reporting unknown counts as complete", async () => {
    mocks.getOverview.mockResolvedValue({
      urgent: [{ id: "dead-letter", count: null }],
      work: [],
      total: null,
      status: "degraded",
      completeness: "partial",
      unavailableSignals: ["deadWebhookDeliveries"],
      observedAt: "2026-09-27T00:00:00.000Z",
    });

    const response = await GET(new Request("https://example.test/api/agent/operations/overview"));
    await expect(response.json()).resolves.toMatchObject({
      data: {
        total: null,
        status: "degraded",
        completeness: "partial",
        unavailableSignals: ["deadWebhookDeliveries"],
        urgent: [{ id: "dead-letter", count: null }],
      },
    });
  });
});
