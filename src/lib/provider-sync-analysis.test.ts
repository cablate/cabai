import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectRows } = vi.hoisted(() => ({ selectRows: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: selectRows }) } }));

import type { orders, plans, userPurchases } from "@/lib/db/schema";
import { analyzePortalyOrderRebuild, analyzeSubscriptionReconciliation } from "@/lib/provider-sync-analysis";

describe("provider sync previews", () => {
  beforeEach(() => selectRows.mockReset());

  it("previews deterministic order, user, and entitlement creation without writing", async () => {
    const localPlan = { id: "plan-1", providerPlanId: "portaly-plan-1" } as typeof plans.$inferSelect;
    selectRows
      .mockResolvedValueOnce([localPlan])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([localPlan])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const snapshot = {
      providerMode: "test" as const,
      externalCalls: 2,
      subscriptions: [],
      orders: [{
        id: "provider-order-1",
        status: "paid",
        creatorSubscriptionPlanId: "portaly-plan-1",
        email: "buyer@example.com",
        amount: 2500,
        currency: "TWD",
        paymentMethod: "card",
        createdAt: "2026-09-27T00:00:00.000Z",
      } as never],
    };

    const first = await analyzePortalyOrderRebuild(snapshot);
    const second = await analyzePortalyOrderRebuild(snapshot);

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.counts).toMatchObject({ ordersCreated: 1, usersCreated: 1, purchasesCreated: 1 });
    expect(first.changes.map(({ entityType, action }) => `${entityType}:${action}`)).toEqual([
      "user:create",
      "order:create",
      "entitlement:create",
    ]);
    expect(selectRows).toHaveBeenCalledTimes(8);
  });

  it("previews terminal subscription revocations and provider-read failures explicitly", async () => {
    const order = {
      id: "order-1",
      userId: "user-1",
      planId: "plan-1",
      merchantOrderNumber: "merchant-1",
      status: "completed",
      subscriptionId: "sub-1",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      cancelEffectiveAt: null,
      nextBillingAt: null,
      refundedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as typeof orders.$inferSelect;
    const purchase = { orderId: order.id, revokedAt: null, revokedBy: null } as typeof userPurchases.$inferSelect;
    selectRows.mockResolvedValueOnce([order]).mockResolvedValueOnce([purchase]);
    const snapshot = {
      externalCalls: 1,
      bySubscriptionId: { "sub-1": { data: { id: "sub-1", status: "expired" } } },
    };

    const analysis = await analyzeSubscriptionReconciliation(snapshot);

    expect(analysis.counts).toMatchObject({ scanned: 1, revoked: 1, errors: 0 });
    expect(analysis.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "entitlement", action: "revoke", entityId: order.id }),
    ]));
  });
});
