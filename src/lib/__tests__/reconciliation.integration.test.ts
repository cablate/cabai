import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  createTestUser, createTestPlan, createTestOrder,
  createTestPurchase, createTestCourse, createTestChapter,
  createTestLesson, linkCourseToPlan, cleanTestData,
} from "@/test/helpers";
import { ensureUserPurchase } from "@/lib/order-lifecycle";
import { getAccessiblePlanIdsForCourse, checkCourseAccess } from "@/lib/course-access";
import { db } from "@/lib/db";
import { orders, userPurchases, planCourses } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";

vi.mock("@/lib/portaly", () => ({
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  getCheckoutSession: vi.fn(),
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  PORTALY_MODE: "test",
  verifyCallback: vi.fn(),
}));

import { getCheckoutSession } from "@/lib/portaly";
import { reconcileOrder } from "@/lib/reconcile";

const getCheckoutSessionMock = vi.mocked(getCheckoutSession);

beforeEach(() => {
  getCheckoutSessionMock.mockReset();
});

describe("Reconciliation / Portaly session confirmation", () => {
  it("does not query or mutate an order owned by another user", async () => {
    await cleanTestData();
    const owner = await createTestUser({ email: "test-reconcile-owner-guard@example.com" });
    const other = await createTestUser({ email: "test-reconcile-other@example.com" });
    const plan = await createTestPlan({ name: "Reconcile Ownership Guard" });
    const order = await createTestOrder(owner.id, plan.id, {
      portalySessionId: "session_owner_guard",
    });

    const reconciled = await reconcileOrder(order.merchantOrderNumber, other.id);

    expect(reconciled).toBe(false);
    expect(getCheckoutSessionMock).not.toHaveBeenCalled();
    const saved = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(saved?.status).toBe("pending");
  });

  it("completes a pending order when session evidence matches, even if customerEmail differs", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-reconcile-owner@example.com" });
    const plan = await createTestPlan({
      name: "Reconcile Dynamic Plan",
      amount: 1500,
      currency: "TWD",
      billingPeriod: "one-time",
      providerPlanId: "provider-dynamic-plan",
    });
    const order = await createTestOrder(user.id, plan.id, {
      portalySessionId: "session_valid",
      expectedAmount: 1500,
      expectedCurrency: "TWD",
    });

    getCheckoutSessionMock.mockResolvedValueOnce({
      data: {
        sessionId: "session_valid",
        status: "paid",
        merchantOrderNumber: order.merchantOrderNumber,
        planId: "provider-dynamic-plan",
        amount: 1500,
        currency: "TWD",
        mode: "test",
        customerEmail: "different-payer@example.com",
      },
    });

    const reconciled = await reconcileOrder(order.merchantOrderNumber, user.id);

    expect(reconciled).toBe(true);
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
    expect(dbOrder?.paidAmount).toBe(1500);

    const purchase = await db.query.userPurchases.findFirst({
      where: and(
        eq(userPurchases.userId, user.id),
        eq(userPurchases.planId, plan.id),
      ),
    });
    expect(purchase).toBeTruthy();
  });

  it("does not complete when the Portaly merchantOrderNumber differs", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-reconcile-order-mismatch@example.com" });
    const plan = await createTestPlan({ name: "Reconcile Merchant Mismatch", amount: 1500 });
    const order = await createTestOrder(user.id, plan.id, {
      portalySessionId: "session_order_mismatch",
      expectedAmount: 1500,
      expectedCurrency: "TWD",
    });

    getCheckoutSessionMock.mockResolvedValueOnce({
      data: {
        sessionId: "session_order_mismatch",
        status: "completed",
        merchantOrderNumber: "different-order",
        amount: 1500,
        currency: "TWD",
        mode: "test",
      },
    });

    const reconciled = await reconcileOrder(order.merchantOrderNumber, user.id);

    expect(reconciled).toBe(false);
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });

  it("does not complete when the Portaly amount differs from the locked order amount", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-reconcile-amount-mismatch@example.com" });
    const plan = await createTestPlan({ name: "Reconcile Amount Mismatch", amount: 1500 });
    const order = await createTestOrder(user.id, plan.id, {
      portalySessionId: "session_amount_mismatch",
      expectedAmount: 1500,
      expectedCurrency: "TWD",
    });

    getCheckoutSessionMock.mockResolvedValueOnce({
      data: {
        sessionId: "session_amount_mismatch",
        status: "completed",
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 1499,
        currency: "TWD",
        mode: "test",
      },
    });

    const reconciled = await reconcileOrder(order.merchantOrderNumber, user.id);

    expect(reconciled).toBe(false);
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("pending");
  });

  it("preserves an existing callbackPayload when reconciliation completes later", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-reconcile-payload@example.com" });
    const plan = await createTestPlan({ name: "Reconcile Payload Preserve", amount: 1500 });
    const originalPayload = { source: "signed-callback", customerEmail: "original@example.com" };
    const order = await createTestOrder(user.id, plan.id, {
      portalySessionId: "session_preserve_payload",
      expectedAmount: 1500,
      expectedCurrency: "TWD",
      callbackPayload: originalPayload,
    });

    getCheckoutSessionMock.mockResolvedValueOnce({
      data: {
        sessionId: "session_preserve_payload",
        status: "completed",
        merchantOrderNumber: order.merchantOrderNumber,
        amount: 1500,
        currency: "TWD",
        mode: "test",
        customerEmail: "later-query@example.com",
      },
    });

    const reconciled = await reconcileOrder(order.merchantOrderNumber, user.id);

    expect(reconciled).toBe(true);
    const dbOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(dbOrder?.status).toBe("completed");
    expect(dbOrder?.callbackPayload).toEqual(originalPayload);
  });
});

describe("Reconciliation / Cleanup (G1)", () => {
  it("G1: pending order > 24h → mark expired, recent order untouched", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-cleanup@example.com" });
    const plan = await createTestPlan({ name: "Cleanup Test Plan" });
    const recentPlan = await createTestPlan({ name: "Cleanup Recent Test Plan" });

    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const oldOrder = await createTestOrder(user.id, plan.id, {
      status: "pending",
      createdAt: oldDate,
    });

    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const recentOrder = await createTestOrder(user.id, recentPlan.id, {
      status: "pending",
      createdAt: recentDate,
    });

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = await db
      .update(orders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(orders.status, "pending"),
          lt(orders.createdAt, cutoff),
        ),
      )
      .returning({ id: orders.id });

    expect(expired.length).toBe(1);
    expect(expired[0]!.id).toBe(oldOrder.id);

    const dbOld = await db.query.orders.findFirst({ where: eq(orders.id, oldOrder.id) });
    expect(dbOld?.status).toBe("expired");

    const dbRecent = await db.query.orders.findFirst({ where: eq(orders.id, recentOrder.id) });
    expect(dbRecent?.status).toBe("pending");
  });
});

describe("Reconciliation / Orphan Repair (G2)", () => {
  it("G2: completed order without userPurchase → ensureUserPurchase creates it", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-orphan@example.com" });
    const plan = await createTestPlan({ name: "Orphan Test Plan" });

    const order = await createTestOrder(user.id, plan.id, {
      status: "completed",
      paidAmount: 9900,
    });

    const before = await db.query.userPurchases.findFirst({
      where: and(
        eq(userPurchases.userId, user.id),
        eq(userPurchases.planId, plan.id),
      ),
    });
    expect(before).toBeUndefined();

    const created = await ensureUserPurchase(user.id, plan.id, order.id);
    expect(created).toBe(true);

    const after = await db.query.userPurchases.findFirst({
      where: and(
        eq(userPurchases.userId, user.id),
        eq(userPurchases.planId, plan.id),
      ),
    });
    expect(after).toBeTruthy();
    expect(after?.orderId).toBe(order.id);
  });
});

describe("Course Access / Grandfather Protection (G3)", () => {
  it("G3a: course removed from plan, user purchased before removal → still has access (grandfathered)", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-grandfather@example.com" });
    const plan = await createTestPlan({ name: "Grandfather Test Plan" });
    const course = await createTestCourse({ title: "Grandfather Course", status: "published" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id);

    await linkCourseToPlan(course.id, plan.id);

    const grantedDate = new Date("2026-01-01T00:00:00.000Z");
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    const purchase = await createTestPurchase(user.id, plan.id, order.id);

    await db.update(userPurchases).set({ grantedAt: grantedDate }).where(eq(userPurchases.id, purchase.id));

    const removedDate = new Date("2026-02-01T00:00:00.000Z");
    await db.update(planCourses)
      .set({ removedAt: removedDate })
      .where(and(eq(planCourses.planId, plan.id), eq(planCourses.courseId, course.id)));

    const accessible = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(accessible.length).toBe(1);
    expect(accessible[0]!.grandfathered).toBe(true);

    const access = await checkCourseAccess(course.id, user.id, user.email);
    expect(access.hasAccess).toBe(true);
  });

  it("G3b: course removed from plan, user purchased AFTER removal → no access", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-no-grandfather@example.com" });
    const plan = await createTestPlan({ name: "No Grandfather Plan" });
    const course = await createTestCourse({ title: "No Grandfather Course", status: "published" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id);

    await linkCourseToPlan(course.id, plan.id);

    const removedDate = new Date("2026-01-01T00:00:00.000Z");
    await db.update(planCourses)
      .set({ removedAt: removedDate })
      .where(and(eq(planCourses.planId, plan.id), eq(planCourses.courseId, course.id)));

    const grantedDate = new Date("2026-02-01T00:00:00.000Z");
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    const purchase = await createTestPurchase(user.id, plan.id, order.id);
    await db.update(userPurchases).set({ grantedAt: grantedDate }).where(eq(userPurchases.id, purchase.id));

    const accessible = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(accessible.length).toBe(0);

    const access = await checkCourseAccess(course.id, user.id, user.email);
    expect(access.hasAccess).toBe(false);
  });

  it("G3c: active course mapping (not removed) + purchase → normal access", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-active-course@example.com" });
    const plan = await createTestPlan({ name: "Active Course Plan" });
    const course = await createTestCourse({ title: "Active Course", status: "published" });
    const chapter = await createTestChapter(course.id);
    await createTestLesson(course.id, chapter.id);

    await linkCourseToPlan(course.id, plan.id);

    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    await createTestPurchase(user.id, plan.id, order.id);

    const accessible = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(accessible.length).toBe(1);
    expect(accessible[0]!.grandfathered).toBe(false);

    const access = await checkCourseAccess(course.id, user.id, user.email);
    expect(access.hasAccess).toBe(true);
  });
});
