/**
 * Plan Actions: Gateway Routing + Sync
 *
 * Tests createPlan, updatePlan, and syncPlansAction server actions.
 * Verifies gateway-based routing (portaly → API first → local DB, manual → local only).
 *
 * Real DB, mocks: Portaly client, admin guard, Next.js navigation/cache.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { cleanTestData } from "@/test/helpers";

// ─── Mocks ───

const mockCreatePortalyPlan = vi.fn();
const mockGetPlan = vi.fn();
const mockUpdatePortalyPlan = vi.fn();

vi.mock("@/lib/portaly-client", () => ({
  createPortalyPlan: (...args: unknown[]) => mockCreatePortalyPlan(...args),
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
  updatePortalyPlan: (...args: unknown[]) => mockUpdatePortalyPlan(...args),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// redirect throws to abort execution — capture it
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((path: string) => {
    const err = new Error("NEXT_REDIRECT") as unknown as Record<string, unknown>;
    err.digest = `NEXT_REDIRECT;${path}`;
    err.path = path;
    throw err;
  }),
}));

// Mock sync-plans for syncPlansAction
const mockSyncPlans = vi.fn();
vi.mock("@/lib/sync-plans", () => ({
  syncPlans: (...args: unknown[]) => mockSyncPlans(...args),
}));

// Import AFTER mocks
import { createPlan, updatePlan, syncPlansAction } from "@/actions/plans";

// ─── Helpers ───

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

function isRedirectError(err: unknown): err is Error & { path: string } {
  return err instanceof Error && "digest" in err &&
    typeof (err as Record<string, unknown>).digest === "string" &&
    ((err as Record<string, unknown>).digest as string).startsWith("NEXT_REDIRECT");
}

// ─── Setup ───

// Track plan IDs created during tests for cleanup
const createdPlanIds: string[] = [];

beforeAll(async () => {
  await cleanTestData();
});

afterAll(async () => {
  // Clean plans created during these tests
  if (createdPlanIds.length > 0) {
    for (const id of createdPlanIds) {
      await db.delete(plans).where(eq(plans.id, id)).catch(() => {});
    }
  }
  // Also clean by name pattern to catch any leftovers
  await db.execute(sql`DELETE FROM plans WHERE name LIKE 'PAT-%'`);
  await cleanTestData();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createPlan tests ───

describe("createPlan", () => {
  it("creates a manual plan locally without calling Portaly API", async () => {
    const uniqueName = `PAT-manual-${Date.now()}`;
    const fd = buildFormData({
      name: uniqueName,
      description: "A local plan",
      amount: "500",
      billingPeriod: "one-time",
      pricingType: "fixed",
      gateway: "manual",
    });

    try {
      await createPlan(null, fd);
    } catch (err) {
      expect(isRedirectError(err)).toBe(true);
    }

    // Portaly API should NOT be called
    expect(mockCreatePortalyPlan).not.toHaveBeenCalled();

    // Plan should exist in DB
    const all = await db.select().from(plans).where(eq(plans.name, uniqueName));
    expect(all).toHaveLength(1);
    expect(all[0]!.gateway).toBe("manual");
    expect(all[0]!.amount).toBe(500);
    expect(all[0]!.billingPeriod).toBe("one-time");
    createdPlanIds.push(all[0]!.id);
  });

  it("creates a portaly plan by calling API first, then stores locally with Portaly ID", async () => {
    const portalyPlanId = `portaly-plan-${Date.now()}`;
    const portalyResponse = {
      id: portalyPlanId,
      name: "PAT-portaly-create",
      description: "Created via API",
      amount: 1200,
      currency: "TWD",
      billingPeriod: "monthly" as const,
      pricingType: "fixed" as const,
      status: "active" as const,
      image: null,
      merchantPlanId: null,
      createdAt: "2026-05-14T00:00:00Z",
      updatedAt: "2026-05-14T00:00:00Z",
    };
    mockCreatePortalyPlan.mockResolvedValue({ data: portalyResponse });

    const fd = buildFormData({
      name: "PAT-portaly-create",
      description: "Created via API",
      amount: "1200",
      billingPeriod: "monthly",
      pricingType: "fixed",
      gateway: "portaly",
    });

    try {
      await createPlan(null, fd);
    } catch (err) {
      expect(isRedirectError(err)).toBe(true);
      if (isRedirectError(err)) {
        expect(err.path).toContain(portalyPlanId);
      }
    }

    // Portaly API should be called
    expect(mockCreatePortalyPlan).toHaveBeenCalledOnce();
    expect(mockCreatePortalyPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "PAT-portaly-create",
        billingPeriod: "monthly",
        amount: 1200,
      }),
    );

    // Plan should exist in DB with Portaly ID
    const stored = await db.select().from(plans).where(eq(plans.id, portalyPlanId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.gateway).toBe("portaly");
    expect(stored[0]!.providerPlanId).toBe(portalyPlanId);
    expect(stored[0]!.name).toBe("PAT-portaly-create");
    expect(stored[0]!.portalyCreatedAt).toBe("2026-05-14T00:00:00Z");
    createdPlanIds.push(portalyPlanId);
  });

  it("creates a local Portaly-backed plan with an existing provider plan id without calling Portaly API", async () => {
    const uniqueName = `PAT-shared-provider-${Date.now()}`;
    const sharedProviderPlanId = `shared-dynamic-${Date.now()}`;
    const fd = buildFormData({
      name: uniqueName,
      description: "Backed by shared dynamic provider plan",
      amount: "1500",
      billingPeriod: "one-time",
      pricingType: "fixed",
      gateway: "portaly",
      providerPlanId: sharedProviderPlanId,
    });

    try {
      await createPlan(null, fd);
    } catch (err) {
      expect(isRedirectError(err)).toBe(true);
    }

    expect(mockCreatePortalyPlan).not.toHaveBeenCalled();

    const stored = await db.select().from(plans).where(eq(plans.name, uniqueName));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.gateway).toBe("portaly");
    expect(stored[0]!.providerPlanId).toBe(sharedProviderPlanId);
    expect(stored[0]!.amount).toBe(1500);
    createdPlanIds.push(stored[0]!.id);
  });

  it("returns error when Portaly API fails during create", async () => {
    mockCreatePortalyPlan.mockResolvedValue({ error: "UPGRADE_REQUIRED" });

    const uniqueName = `PAT-fail-${Date.now()}`;
    const fd = buildFormData({
      name: uniqueName,
      amount: "100",
      billingPeriod: "one-time",
      gateway: "portaly",
    });

    const result = await createPlan(null, fd);

    expect(result?.error).toContain("Portaly 建立失敗");
    expect(result?.error).toContain("UPGRADE_REQUIRED");

    // No plan should be stored locally
    const stored = await db.select().from(plans).where(eq(plans.name, uniqueName));
    expect(stored).toHaveLength(0);
  });

  it("validates required fields", async () => {
    const fd = buildFormData({
      name: "",
      amount: "-1",
      billingPeriod: "invalid",
    });

    const result = await createPlan(null, fd);
    expect(result?.fieldErrors).toBeDefined();
  });
});

// ─── updatePlan tests ───

describe("updatePlan", () => {
  let manualPlanId: string;
  let portalyUpdatePlanId: string;
  let sharedProviderPlanId: string;

  beforeAll(async () => {
    const ts = Date.now();
    manualPlanId = `PAT-um-${ts}`;
    await db.insert(plans).values({
      id: manualPlanId,
      name: `PAT-manual-edit-${ts}`,
      amount: 300,
      currency: "TWD",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      gateway: "manual",
    });
    createdPlanIds.push(manualPlanId);

    portalyUpdatePlanId = `PAT-up-${ts}`;
    await db.insert(plans).values({
      id: portalyUpdatePlanId,
      name: `PAT-portaly-edit-${ts}`,
      amount: 900,
      currency: "TWD",
      billingPeriod: "monthly",
      pricingType: "fixed",
      status: "active",
      gateway: "portaly",
    });
    createdPlanIds.push(portalyUpdatePlanId);

    sharedProviderPlanId = `PAT-shared-${ts}`;
    await db.insert(plans).values({
      id: sharedProviderPlanId,
      providerPlanId: `shared-provider-${ts}`,
      name: `PAT-shared-edit-${ts}`,
      amount: 700,
      currency: "TWD",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      gateway: "portaly",
    });
    createdPlanIds.push(sharedProviderPlanId);
  });

  it("updates a manual plan locally without calling Portaly API", async () => {
    const newName = `PAT-manual-updated-${Date.now()}`;
    const fd = buildFormData({
      name: newName,
      amount: "400",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
    });

    const result = await updatePlan(manualPlanId, null, fd);

    expect(result?.success).toBe(true);
    expect(mockUpdatePortalyPlan).not.toHaveBeenCalled();

    const updated = await db.select().from(plans).where(eq(plans.id, manualPlanId));
    expect(updated[0]!.name).toBe(newName);
    expect(updated[0]!.amount).toBe(400);
  });

  it("requires a provider plan ID when converting a manual plan to Portaly", async () => {
    const fd = buildFormData({
      name: "PAT-manual-convert-missing-provider",
      amount: "400",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      gateway: "portaly",
    });

    const result = await updatePlan(manualPlanId, null, fd);

    expect(result?.fieldErrors?.providerPlanId?.[0]).toContain("必須填寫");
    expect(mockGetPlan).not.toHaveBeenCalled();

    const unchanged = await db.select().from(plans).where(eq(plans.id, manualPlanId));
    expect(unchanged[0]!.gateway).toBe("manual");
  });

  it("rejects an incompatible shared provider plan without changing the local plan", async () => {
    const providerPlanId = `shared-fixed-${Date.now()}`;
    mockGetPlan.mockResolvedValue({
      data: {
        id: providerPlanId,
        name: "Fixed provider plan",
        amount: 400,
        currency: "TWD",
        billingPeriod: "one-time",
        pricingType: "fixed",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const fd = buildFormData({
      name: "PAT-manual-convert-invalid-provider",
      amount: "400",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      gateway: "portaly",
      providerPlanId,
    });

    const result = await updatePlan(manualPlanId, null, fd);

    expect(result?.fieldErrors?.providerPlanId?.[0]).toContain("可自訂金額");
    const unchanged = await db.select().from(plans).where(eq(plans.id, manualPlanId));
    expect(unchanged[0]!.gateway).toBe("manual");
    expect(unchanged[0]!.providerPlanId).toBeNull();
  });

  it("converts a manual one-time plan to a verified shared Portaly plan", async () => {
    const providerPlanId = `shared-dynamic-${Date.now()}`;
    mockGetPlan.mockResolvedValue({
      data: {
        id: providerPlanId,
        name: "Shared dynamic provider plan",
        amount: 0,
        currency: "TWD",
        billingPeriod: "one-time",
        pricingType: "dynamic",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const fd = buildFormData({
      name: "PAT-manual-converted",
      amount: "1500",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      gateway: "portaly",
      providerPlanId,
    });

    const result = await updatePlan(manualPlanId, null, fd);

    expect(result?.success).toBe(true);
    expect(mockGetPlan).toHaveBeenCalledWith(providerPlanId);
    expect(mockUpdatePortalyPlan).not.toHaveBeenCalled();

    const updated = await db.select().from(plans).where(eq(plans.id, manualPlanId));
    expect(updated[0]!.gateway).toBe("portaly");
    expect(updated[0]!.providerPlanId).toBe(providerPlanId);
    expect(updated[0]!.amount).toBe(1500);
  });

  it("updates a portaly plan by calling API first, then updating local DB", async () => {
    mockUpdatePortalyPlan.mockResolvedValue({ data: { id: portalyUpdatePlanId } });

    const newName = `PAT-portaly-updated-${Date.now()}`;
    const fd = buildFormData({
      name: newName,
      amount: "1100",
      billingPeriod: "monthly",
      pricingType: "fixed",
      status: "active",
    });

    const result = await updatePlan(portalyUpdatePlanId, null, fd);

    expect(result?.success).toBe(true);

    // Portaly API called with correct params
    expect(mockUpdatePortalyPlan).toHaveBeenCalledOnce();
    expect(mockUpdatePortalyPlan).toHaveBeenCalledWith(
      portalyUpdatePlanId,
      expect.objectContaining({
        name: newName,
        amount: 1100,
      }),
    );

    // Local DB updated
    const updated = await db.select().from(plans).where(eq(plans.id, portalyUpdatePlanId));
    expect(updated[0]!.name).toBe(newName);
    expect(updated[0]!.amount).toBe(1100);
  });

  it("does not convert an existing Portaly plan back to Manual", async () => {
    const fd = buildFormData({
      name: "PAT-portaly-stays-portaly",
      amount: "1100",
      billingPeriod: "monthly",
      pricingType: "fixed",
      status: "active",
      gateway: "manual",
    });

    const result = await updatePlan(portalyUpdatePlanId, null, fd);

    expect(result?.fieldErrors?.gateway?.[0]).toContain("不能在此改回 Manual");
    const unchanged = await db.select().from(plans).where(eq(plans.id, portalyUpdatePlanId));
    expect(unchanged[0]!.gateway).toBe("portaly");
  });

  it("updates a shared-provider local plan without calling Portaly API", async () => {
    const newName = `PAT-shared-updated-${Date.now()}`;
    const fd = buildFormData({
      name: newName,
      amount: "800",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
      providerPlanId: `shared-provider-updated-${Date.now()}`,
    });

    const result = await updatePlan(sharedProviderPlanId, null, fd);

    expect(result?.success).toBe(true);
    expect(mockUpdatePortalyPlan).not.toHaveBeenCalled();

    const updated = await db.select().from(plans).where(eq(plans.id, sharedProviderPlanId));
    expect(updated[0]!.name).toBe(newName);
    expect(updated[0]!.amount).toBe(800);
    expect(updated[0]!.providerPlanId).toContain("shared-provider-updated-");
  });

  it("does NOT update local DB when Portaly API fails", async () => {
    mockUpdatePortalyPlan.mockResolvedValue({ error: "Rate limit exceeded" });

    const fd = buildFormData({
      name: "PAT-should-not-change",
      amount: "9999",
      billingPeriod: "monthly",
      pricingType: "fixed",
      status: "active",
    });

    const result = await updatePlan(portalyUpdatePlanId, null, fd);

    expect(result?.error).toContain("Portaly 同步失敗");

    // Local DB should still have old values (amount=1100 from previous test)
    const unchanged = await db.select().from(plans).where(eq(plans.id, portalyUpdatePlanId));
    expect(unchanged[0]!.amount).toBe(1100);
  });

  it("returns error for non-existent plan", async () => {
    const fd = buildFormData({
      name: "Ghost",
      amount: "100",
      billingPeriod: "one-time",
      pricingType: "fixed",
      status: "active",
    });

    const result = await updatePlan("non-existent-id", null, fd);
    expect(result?.error).toBe("方案不存在");
  });
});

// ─── syncPlansAction tests ───

describe("syncPlansAction", () => {
  it("returns synced count on success", async () => {
    mockSyncPlans.mockResolvedValue({ synced: 3 });

    const result = await syncPlansAction();

    expect(result?.synced).toBe(3);
    expect(result?.error).toBeUndefined();
  });

  it("returns error when sync fails", async () => {
    mockSyncPlans.mockResolvedValue({ synced: 0, error: "API unreachable" });

    const result = await syncPlansAction();

    expect(result?.error).toBe("API unreachable");
  });

  it("catches thrown exceptions", async () => {
    mockSyncPlans.mockRejectedValue(new Error("Network timeout"));

    const result = await syncPlansAction();

    expect(result?.error).toContain("Network timeout");
  });
});
