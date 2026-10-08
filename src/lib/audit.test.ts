import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: mocks.insert },
}));

import { writeRequiredAuditLog } from "./audit";

describe("writeRequiredAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ returning: mocks.returning });
  });

  it("returns durable audit identity and sanitizes sensitive metadata", async () => {
    mocks.returning.mockResolvedValue([{ id: "audit-1" }]);

    await expect(writeRequiredAuditLog({
      actorType: "agent",
      actorId: "agent-1",
      action: "grant_access",
      entityType: "userPurchase",
      entityId: "purchase-1",
      metadata: { email: "person@example.com", apiKey: "secret", safeCount: 3 },
    })).resolves.toBe("audit-1");

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { email: "pe***@example.com", apiKey: "[redacted]", safeCount: 3 },
    }));
  });

  it("surfaces persistence failure instead of allowing silent success", async () => {
    mocks.returning.mockRejectedValue(new Error("database unavailable"));

    await expect(writeRequiredAuditLog({
      actorType: "agent",
      actorId: "agent-1",
      action: "webhook_retry",
      entityType: "webhookLog",
      entityId: "log-1",
    })).rejects.toThrow("database unavailable");
  });
});
