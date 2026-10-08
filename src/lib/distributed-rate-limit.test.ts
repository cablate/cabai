import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), onConflictDoUpdate: vi.fn(), returning: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));

import { checkDistributedRateLimit } from "./distributed-rate-limit";

describe("checkDistributedRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflictDoUpdate });
    mocks.onConflictDoUpdate.mockReturnValue({ returning: mocks.returning });
  });

  it("returns remaining quota from the atomically persisted counter", async () => {
    mocks.returning.mockResolvedValue([{ count: 3 }]);
    const result = await checkDistributedRateLimit({ key: "upload:agent:a", limit: 5, windowMs: 60_000, now: new Date("2026-09-27T00:00:30Z") });
    expect(result).toMatchObject({ allowed: true, limit: 5, remaining: 2, retryAfterMs: 30_000 });
  });

  it("rejects a count above the shared limit without negative remaining quota", async () => {
    mocks.returning.mockResolvedValue([{ count: 6 }]);
    const result = await checkDistributedRateLimit({ key: "upload:agent:a", limit: 5, windowMs: 60_000, now: new Date("2026-09-27T00:00:30Z") });
    expect(result).toMatchObject({ allowed: false, remaining: 0 });
  });
});
