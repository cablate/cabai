import { describe, expect, it } from "vitest";
import type { PortalyPlan } from "@/lib/portaly-types";
import {
  buildPlanSyncPreview,
  matchesPlanSyncChangeSet,
  matchesProviderSyncRequest,
} from "@/lib/provider-sync-plans";

const plan = (overrides: Partial<PortalyPlan> = {}): PortalyPlan => ({
  id: "portaly-plan-1",
  name: "Monthly",
  description: "Monthly access",
  amount: 1200,
  currency: "TWD",
  billingPeriod: "monthly",
  pricingType: "fixed",
  status: "active",
  image: "https://example.com/plan.png",
  merchantPlanId: "merchant-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  ...overrides,
});

function local(planValue: PortalyPlan): Parameters<typeof buildPlanSyncPreview>[1][number] {
  return {
    id: planValue.id,
    providerPlanId: planValue.id,
    name: planValue.name,
    description: planValue.description ?? null,
    amount: planValue.amount,
    currency: planValue.currency,
    billingPeriod: planValue.billingPeriod,
    pricingType: planValue.pricingType ?? null,
    status: planValue.status,
    image: planValue.image ?? null,
    merchantPlanId: planValue.merchantPlanId ?? null,
    portalyCreatedAt: planValue.createdAt,
    portalyUpdatedAt: planValue.updatedAt,
  };
}

describe("provider plan-sync change sets", () => {
  it("classifies creates, provider-owned updates, and unchanged rows without deletions", () => {
    const unchanged = plan({ id: "same" });
    const currentUpdate = plan({ id: "update", amount: 900 });
    const result = buildPlanSyncPreview(
      [plan({ id: "new" }), unchanged, plan({ id: "update", amount: 1200 })],
      [local(unchanged), local(currentUpdate)],
    );

    expect(result.counts).toEqual({ create: 1, update: 1, unchanged: 1 });
    expect(result.changes.map(({ planId, action }) => [planId, action])).toEqual([
      ["new", "create"],
      ["same", "unchanged"],
      ["update", "update"],
    ]);
    expect(result.changes.find(({ planId }) => planId === "update")?.before?.amount).toBe(900);
    expect(result.changes.find(({ planId }) => planId === "update")?.after.amount).toBe(1200);
  });

  it("changes freshness when provider-authoritative local state changes", () => {
    const upstream = plan();
    const original = buildPlanSyncPreview([upstream], [local(upstream)]);
    const drifted = buildPlanSyncPreview([upstream], [local(plan({ amount: 1000 }))]);

    expect(matchesPlanSyncChangeSet(original, original)).toBe(true);
    expect(matchesPlanSyncChangeSet(original, drifted)).toBe(false);
  });

  it("replays only the exact original change-set request for an idempotency key", () => {
    const prior = { changeSetId: "change-1", requestFingerprint: "fingerprint-1" };

    expect(matchesProviderSyncRequest(prior, prior)).toBe(true);
    expect(matchesProviderSyncRequest(prior, { ...prior, changeSetId: "change-2" })).toBe(false);
    expect(matchesProviderSyncRequest(prior, { ...prior, requestFingerprint: "fingerprint-2" })).toBe(false);
  });
});
