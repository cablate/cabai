/**
 * Phase 3: Access / Entitlement Check — B1-B6
 * Tests the multi-layer access checking logic.
 * Real DB, mocks Portaly API (listSubscriptions).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestUser, createTestPlan, createTestOrder,
  createTestPurchase, createTestCourse, linkCourseToPlan,
  cleanTestData,
} from "@/test/helpers";
import { checkPlanAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { entitlementOutbox, orders, userPurchases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock Portaly API
vi.mock("@/lib/portaly", () => ({
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  PORTALY_MODE: "test",
  verifyCallback: vi.fn(),
}));

import { checkCourseAccess } from "@/lib/course-access";
import { listSubscriptions } from "@/lib/portaly";

const listSubscriptionsMock = vi.mocked(listSubscriptions);

let userId: string;
let userEmail: string;

beforeAll(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

// Each test gets a fresh plan to avoid purchase cross-contamination
async function freshPlanAndUser(role: "member" | "admin" = "member") {
  await cleanTestData();
  const user = await createTestUser({ email: "test-access@example.com", role });
  userId = user.id;
  userEmail = user.email;
  const plan = await createTestPlan();
  return plan.id;
}

describe("Access / Local checks (B1-B5)", () => {
  it("B1: active purchase → has_access: true, source: one-time", async () => {
    const planId = await freshPlanAndUser();
    const order = await createTestOrder(userId, planId, { status: "completed" });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
    if (result.hasAccess) expect(result.source).toBe("one-time");
  });

  it("B3: one-time completed order → has_access: true", async () => {
    const planId = await freshPlanAndUser();
    const order = await createTestOrder(userId, planId, { status: "completed", subscriptionId: null });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
    if (result.hasAccess) expect(result.source).toBe("one-time");
  });

  it("B4: subscription canceled but within paid period → has_access: true", async () => {
    const planId = await freshPlanAndUser();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_test",
      subscriptionStatus: "canceled",
      cancelAtPeriodEnd: true,
      cancelEffectiveAt: futureDate,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
    if (result.hasAccess) expect(result.source).toBe("subscription");
  });

  it("B5: subscription canceled past cancelEffectiveAt → has_access: false", async () => {
    const planId = await freshPlanAndUser();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_expired",
      subscriptionStatus: "canceled",
      cancelAtPeriodEnd: true,
      cancelEffectiveAt: pastDate,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId, userEmail);
    expect(result.hasAccess).toBe(false);
  });

  it("uses nextBillingAt as the paid-through boundary for active period-end cancellation", async () => {
    const planId = await freshPlanAndUser();
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_cancel_active_future",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      cancelEffectiveAt: null,
      nextBillingAt: futureDate,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
  });

  it("denies an active period-end cancellation after its nextBillingAt boundary", async () => {
    const planId = await freshPlanAndUser();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_cancel_active_past",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      cancelEffectiveAt: null,
      nextBillingAt: pastDate,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(false);
  });

  it("fails closed when period-end cancellation has no paid-through timestamp", async () => {
    const planId = await freshPlanAndUser();
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_cancel_active_unknown",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      cancelEffectiveAt: null,
      nextBillingAt: null,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(false);
  });

  it("F-01 regression: one-time order whose subscriptionId leaked a sessionId still grants access", async () => {
    // Pre-F-01 callbacks fell back sessionId into subscriptionId, so a
    // one-time purchase could end up with subscriptionId != null but
    // subscriptionStatus = null. The original access.ts then classified
    // it as "subscription with missing status" and denied access. The fix
    // is to classify by subscriptionStatus instead.
    const planId = await freshPlanAndUser();
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sess_legacy_fallback",
      subscriptionStatus: null,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
    if (result.hasAccess) expect(result.source).toBe("one-time");
  });

  it("B6: active subscription stale > 35 days → not trusted locally", async () => {
    const planId = await freshPlanAndUser();
    const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const order = await createTestOrder(userId, planId, {
      status: "completed",
      subscriptionId: "sub_stale",
      subscriptionStatus: "active",
      nextBillingAt: staleDate,
    });
    await createTestPurchase(userId, planId, order.id);

    const result = await checkPlanAccess(userId, planId, userEmail);
    expect(result.hasAccess).toBe(false);
  });

  it("manual grant with no expiry → has_access: true, source: manual", async () => {
    const planId = await freshPlanAndUser();
    const order = await createTestOrder(userId, planId, { status: "completed" });
    await createTestPurchase(userId, planId, order.id, { grantedBy: "manual" });

    const result = await checkPlanAccess(userId, planId);
    expect(result.hasAccess).toBe(true);
    if (result.hasAccess) expect(result.source).toBe("manual");
  });
});

describe("Access / provider identity self-heal", () => {
  it("matches providerPlanId and persists complete active subscription evidence", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-self-heal-provider@example.com" });
    const plan = await createTestPlan({
      name: "Self-heal provider mapping",
      providerPlanId: "provider-plan-remote",
      billingPeriod: "monthly",
    });
    listSubscriptionsMock.mockResolvedValueOnce({
      data: [{
        id: "sub-self-heal-provider",
        profileId: "profile-1",
        planId: "provider-plan-remote",
        planName: "Remote plan",
        amount: 1_500,
        currency: "TWD",
        billingPeriod: "monthly",
        status: "active",
        mode: "test",
        cancelAtPeriodEnd: false,
        nextBillingAt: "2026-08-15T00:00:00.000Z",
        customerEmail: user.email,
        createdAt: "2026-07-15T00:00:00.000Z",
      }],
    });

    const result = await checkPlanAccess(user.id, plan.id, user.email);
    expect(result).toEqual({ hasAccess: true, source: "subscription" });

    const order = await db.query.orders.findFirst({
      where: eq(orders.subscriptionId, "sub-self-heal-provider"),
    });
    expect(order).toMatchObject({
      planId: plan.id,
      portalySessionId: null,
      status: "completed",
      subscriptionStatus: "active",
      paidAmount: 1_500,
      expectedAmount: 1_500,
      expectedCurrency: "TWD",
    });
    expect(await db.select().from(userPurchases)).toHaveLength(1);
    expect(await db.select().from(entitlementOutbox)).toEqual([
      expect.objectContaining({
        eventType: "entitlement.granted",
        source: "subscription",
        triggeredBy: "access.self-heal",
      }),
    ]);
  });

  it("fails closed when matching provider evidence conflicts with a local terminal order", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-self-heal-terminal@example.com" });
    const plan = await createTestPlan({
      name: "Self-heal terminal guard",
      providerPlanId: "provider-plan-terminal",
      billingPeriod: "monthly",
    });
    await createTestOrder(user.id, plan.id, {
      status: "refunded",
      subscriptionId: "sub-self-heal-terminal",
    });
    listSubscriptionsMock.mockResolvedValueOnce({
      data: [{
        id: "sub-self-heal-terminal",
        profileId: "profile-1",
        planId: "provider-plan-terminal",
        planName: "Remote plan",
        amount: 1_500,
        currency: "TWD",
        billingPeriod: "monthly",
        status: "active",
        mode: "test",
        cancelAtPeriodEnd: false,
        customerEmail: user.email,
        createdAt: "2026-07-15T00:00:00.000Z",
      }],
    });

    await expect(checkPlanAccess(user.id, plan.id, user.email)).resolves.toEqual({ hasAccess: false });
    expect(await db.select().from(userPurchases)).toHaveLength(0);
    expect(await db.select().from(entitlementOutbox)).toHaveLength(0);
  });

  it("fails closed when a provider subscription is already bound to another local owner", async () => {
    await cleanTestData();
    const owner = await createTestUser({ email: "test-self-heal-existing-owner@example.com" });
    const requester = await createTestUser({ email: "test-self-heal-requester@example.com" });
    const plan = await createTestPlan({
      name: "Self-heal owner conflict",
      providerPlanId: "provider-plan-owner-conflict",
      billingPeriod: "monthly",
    });
    await createTestOrder(owner.id, plan.id, {
      status: "completed",
      subscriptionId: "sub-self-heal-owner-conflict",
      subscriptionStatus: "active",
    });
    listSubscriptionsMock.mockResolvedValueOnce({
      data: [{
        id: "sub-self-heal-owner-conflict",
        profileId: "profile-1",
        planId: "provider-plan-owner-conflict",
        planName: "Remote plan",
        amount: 1_500,
        currency: "TWD",
        billingPeriod: "monthly",
        status: "active",
        mode: "test",
        cancelAtPeriodEnd: false,
        customerEmail: requester.email,
        createdAt: "2026-07-15T00:00:00.000Z",
      }],
    });

    const result = await checkPlanAccess(requester.id, plan.id, requester.email);

    expect(result).toEqual({ hasAccess: false });
    expect(await db.select().from(userPurchases)).toHaveLength(0);
    expect(await db.select().from(entitlementOutbox)).toHaveLength(0);
  });
});

describe("Admin bypass", () => {
  it("checkPlanAccess: admin role → has_access: true without purchase", async () => {
    const planId = await freshPlanAndUser("admin");
    // No purchase created — admin should still have access
    const result = await checkPlanAccess(userId, planId, userEmail, "admin");
    expect(result.hasAccess).toBe(true);
  });

  it("checkPlanAccess: non-admin role → has_access: false without purchase", async () => {
    const planId = await freshPlanAndUser();
    const result = await checkPlanAccess(userId, planId, userEmail, "member");
    expect(result.hasAccess).toBe(false);
  });

  it("checkPlanAccess: no role param → has_access: false without purchase", async () => {
    const planId = await freshPlanAndUser();
    const result = await checkPlanAccess(userId, planId, userEmail);
    expect(result.hasAccess).toBe(false);
  });

  it("checkCourseAccess: admin role → has_access: true without purchase", async () => {
    const planId = await freshPlanAndUser("admin");
    const course = await createTestCourse({ status: "published" });
    await linkCourseToPlan(course.id, planId);
    // No purchase — admin should still have access
    const result = await checkCourseAccess(course.id, userId, userEmail, "admin");
    expect(result.hasAccess).toBe(true);
    expect(result.planId).toBe("");
  });

  it("checkCourseAccess: non-admin → has_access: false without purchase", async () => {
    const planId = await freshPlanAndUser();
    const course = await createTestCourse({ status: "published" });
    await linkCourseToPlan(course.id, planId);
    const result = await checkCourseAccess(course.id, userId, userEmail, "member");
    expect(result.hasAccess).toBe(false);
  });
});
