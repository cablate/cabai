/**
 * Disposable-DB cutover regression, not live-provider acceptance.
 * Historical Marketplace rows are fixtures: the disabled legacy ingress is
 * deliberately not called. Plan/checkout mutations and access owners are real.
 */
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orders, planCourses, plans, portalyMarketplaceEvents, portalyProductMappings, userPurchases,
} from "@/lib/db/schema";
import {
  cleanTestData, createTestCourse, createTestMarketplaceEvent,
  createTestProductMapping, createTestPurchase, createTestUser, linkCourseToPlan,
} from "@/test/helpers";

const mocks = vi.hoisted(() => ({
  getPlan: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  listSubscriptions: vi.fn(),
}));

vi.mock("@/lib/portaly-client", () => ({
  getPlan: mocks.getPlan,
  createPortalyPlan: mocks.createPlan,
  updatePortalyPlan: mocks.updatePlan,
}));
vi.mock("@/lib/portaly", () => ({
  listSubscriptions: mocks.listSubscriptions,
  getPlans: vi.fn().mockRejectedValue(new Error("Unexpected provider sync")),
}));
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ user: { id: "synthetic-cutover-admin" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// Do not create/rotate operator log files while importing real action owners.
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { updatePlan } from "@/actions/plans";
import { updatePlanCheckoutAction } from "@/app/admin/plans/[id]/checkout/actions";
import { checkPlanAccess } from "@/lib/access";
import { checkCourseAccess } from "@/lib/course-access";

const createdPlanIds: string[] = [];

beforeEach(async () => {
  // This helper guards both loopback URL + explicit disposable DB confirmation
  // and the actual initialized pool before performing any cleanup/writes.
  await cleanTestData();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  mocks.listSubscriptions.mockRejectedValue(new Error("Unexpected provider fallback"));
});

afterEach(async () => {
  await cleanTestData();
  vi.unstubAllGlobals();
  for (const id of createdPlanIds.splice(0)) {
    await db.delete(plans).where(eq(plans.id, id));
  }
});

async function createHistoricalFixture() {
  const suffix = crypto.randomUUID();
  const planId = `cutover-${suffix}`;
  const providerPlanId = `dynamic-${suffix}`;
  const productId = `marketplace-product-${suffix}`;
  const marketplaceOrderId = `marketplace-order-${suffix}`;
  const user = await createTestUser({ role: "member" });
  createdPlanIds.push(planId);
  await db.insert(plans).values({
    id: planId,
    slug: `historical-${suffix}`,
    name: "Historical one-time course",
    amount: 1500,
    currency: "TWD",
    billingPeriod: "one-time",
    pricingType: "fixed",
    status: "active",
    gateway: "manual",
    providerPlanId: null,
    purchaseButtonMode: "external",
    externalCheckoutUrl: "https://example.com/legacy-marketplace",
    externalCheckoutLabel: "Historical Marketplace checkout",
    externalCheckoutNewTab: true,
  });
  const course = await createTestCourse({ status: "published" });
  await linkCourseToPlan(course.id, planId);
  await createTestProductMapping(productId, planId);

  // Mirror the historical processor's local row shape, without reactivating
  // Marketplace ingress or claiming this fixture verified a real payment.
  const [order] = await db.insert(orders).values({
    userId: user.id,
    planId,
    merchantOrderNumber: `mkt-${marketplaceOrderId}`,
    status: "completed",
    paidAmount: 1500,
    currency: "TWD",
    paymentMethod: "historical-fixture",
    callbackPayload: { fixture: "historical-marketplace" },
    createdAt: new Date("2025-01-01T00:00:00Z"),
  }).returning();
  const purchase = await createTestPurchase(user.id, planId, order!.id, {
    grantedBy: "payment",
    grantedAt: new Date("2025-01-01T00:00:00Z"),
  });
  const event = await createTestMarketplaceEvent({
    portalyOrderId: marketplaceOrderId,
    portalyProductId: productId,
    customerEmail: user.email,
    amount: 1500,
    status: "processed",
    matchedUserId: user.id,
    matchedPlanId: planId,
    createdOrderId: order!.id,
  });
  return { planId, providerPlanId, productId, user, course, order: order!, purchase, event };
}

type Fixture = Awaited<ReturnType<typeof createHistoricalFixture>>;

function conversionForm(fixture: Fixture) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Historical one-time course",
    amount: "1500",
    billingPeriod: "one-time",
    pricingType: "fixed",
    status: "active",
    gateway: "portaly",
    providerPlanId: fixture.providerPlanId,
    slug: `historical-${fixture.planId.slice("cutover-".length)}`,
  })) form.set(key, value);
  return form;
}

function providerPlan(fixture: Fixture, pricingType = "dynamic") {
  return {
    id: fixture.providerPlanId,
    name: "Synthetic shared provider plan",
    amount: 0,
    currency: "TWD",
    billingPeriod: "one-time",
    pricingType,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

async function historicalSnapshot(fixture: Fixture) {
  return {
    orders: await db.select().from(orders).where(eq(orders.planId, fixture.planId)),
    purchases: await db.select().from(userPurchases).where(eq(userPurchases.planId, fixture.planId)),
    events: await db.select().from(portalyMarketplaceEvents).where(eq(portalyMarketplaceEvents.id, fixture.event.id)),
    courseMappings: await db.select().from(planCourses).where(eq(planCourses.planId, fixture.planId)),
    mappings: await db.select().from(portalyProductMappings).where(eq(portalyProductMappings.planId, fixture.planId)),
  };
}

async function expectMemberAccess(fixture: Fixture) {
  expect(await checkPlanAccess(fixture.user.id, fixture.planId, fixture.user.email, "member"))
    .toEqual({ hasAccess: true, source: "one-time" });
  expect(await checkCourseAccess(fixture.course.id, fixture.user.id, fixture.user.email, "member"))
    .toEqual({ hasAccess: true, planId: fixture.planId });
  expect(mocks.listSubscriptions).not.toHaveBeenCalled();
}

describe("historical Marketplace entitlement survives Payment cutover", () => {
  it("uses real plan and checkout actions while preserving local identity, historical records and member course access", async () => {
    const fixture = await createHistoricalFixture();
    const nonBuyer = await createTestUser({ role: "member" });
    const expectNonBuyerDenied = async () => {
      // Local-only denial: do not let provider fallback grant this member.
      expect(await checkPlanAccess(nonBuyer.id, fixture.planId, undefined, "member"))
        .toEqual({ hasAccess: false });
      expect(await checkCourseAccess(fixture.course.id, nonBuyer.id, undefined, "member"))
        .toEqual({ hasAccess: false, planId: fixture.planId });
      expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    };
    const historical = await historicalSnapshot(fixture);
    expect(historical.orders).toHaveLength(1);
    expect(historical.purchases).toHaveLength(1);
    expect(historical.purchases[0]!.id).toBe(fixture.purchase.id);
    await expectMemberAccess(fixture);
    await expectNonBuyerDenied();
    mocks.getPlan.mockResolvedValue({ data: providerPlan(fixture) });

    expect(await updatePlan(fixture.planId, null, conversionForm(fixture))).toEqual({ success: true });
    expect(mocks.getPlan).toHaveBeenCalledExactlyOnceWith(fixture.providerPlanId);
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.updatePlan).not.toHaveBeenCalled();
    const converted = await db.query.plans.findFirst({ where: eq(plans.id, fixture.planId) });
    expect(converted).toMatchObject({
      id: fixture.planId, gateway: "portaly", providerPlanId: fixture.providerPlanId,
      slug: `historical-${fixture.planId.slice("cutover-".length)}`,
      amount: 1500, pricingType: "fixed", billingPeriod: "one-time", purchaseButtonMode: "external",
    });
    expect(await historicalSnapshot(fixture)).toEqual(historical);
    await expectMemberAccess(fixture);
    await expectNonBuyerDenied();

    expect(await updatePlanCheckoutAction(fixture.planId, { purchaseButtonMode: "internal" }))
      .toEqual({ success: true });
    const cutover = await db.query.plans.findFirst({ where: eq(plans.id, fixture.planId) });
    expect(cutover).toMatchObject({
      id: fixture.planId, gateway: "portaly", providerPlanId: fixture.providerPlanId,
      slug: `historical-${fixture.planId.slice("cutover-".length)}`,
      status: "active", purchaseButtonMode: "internal",
      externalCheckoutUrl: null, externalCheckoutLabel: null,
    });
    expect(await db.query.plans.findFirst({ where: eq(plans.id, fixture.providerPlanId) })).toBeUndefined();
    expect(await historicalSnapshot(fixture)).toEqual(historical);
    await expectMemberAccess(fixture);
    await expectNonBuyerDenied();
  });

  it("leaves the original plan, external checkout and entitlements unchanged when provider mapping is incompatible", async () => {
    const fixture = await createHistoricalFixture();
    const originalPlan = await db.query.plans.findFirst({ where: eq(plans.id, fixture.planId) });
    const historical = await historicalSnapshot(fixture);
    mocks.getPlan.mockResolvedValue({ data: providerPlan(fixture, "fixed") });

    const result = await updatePlan(fixture.planId, null, conversionForm(fixture));
    expect(result?.fieldErrors?.providerPlanId?.[0]).toContain("可自訂金額");
    expect(mocks.getPlan).toHaveBeenCalledExactlyOnceWith(fixture.providerPlanId);
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.updatePlan).not.toHaveBeenCalled();
    expect(await db.query.plans.findFirst({ where: eq(plans.id, fixture.planId) })).toEqual(originalPlan);
    expect(await historicalSnapshot(fixture)).toEqual(historical);
    await expectMemberAccess(fixture);
  });
});

