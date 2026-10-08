/**
 * M-1 regression: course-access grandfather must re-validate access.
 *
 * A course removed from a plan (`planCourses.removedAt` set) stays accessible to
 * users who purchased the plan BEFORE removal — "grandfather protection". The
 * bug (M-1) was that the grandfather branch only checked "non-revoked purchase
 * that predates removal" and skipped the expiry / subscription-status validation
 * the active-mapping branch performs via `checkPlanAccess`. An expired manual
 * grant (or a lapsed subscription whose revoke callback never landed) could
 * therefore resurrect a removed course. These tests pin the fixed behaviour:
 * grandfather access now requires the purchase to be BOTH pre-removal AND still
 * currently valid.
 *
 * Real DB, mocks Portaly API (so the self-heal fallback finds nothing).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestUser,
  createTestPlan,
  createTestOrder,
  createTestPurchase,
  createTestCourse,
  linkCourseToPlan,
  cleanTestData,
} from "@/test/helpers";

vi.mock("@/lib/portaly", () => ({
  listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
  getSubscription: vi.fn().mockResolvedValue({ data: null }),
  PORTALY_MODE: "test",
  verifyCallback: vi.fn(),
}));

import {
  checkCourseAccess,
  getAccessiblePlanIdsForCourse,
  listLocallyEligibleUserIdsForCourse,
} from "@/lib/course-access";

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

describe("course-access grandfather re-validation (M-1)", () => {
  it("active mapping + valid purchase → access (not grandfathered)", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-ca-active@example.com" });
    const plan = await createTestPlan();
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    await createTestPurchase(user.id, plan.id, order.id);
    const course = await createTestCourse();
    await linkCourseToPlan(course.id, plan.id); // active mapping (removedAt = null)

    const rows = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(rows).toEqual([{ planId: plan.id, grandfathered: false }]);

    const result = await checkCourseAccess(course.id, user.id, user.email);
    expect(result.hasAccess).toBe(true);
    expect(await listLocallyEligibleUserIdsForCourse(course.id)).toContain(user.id);
  });

  it("VALID grant before course removal → grandfathered access", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-ca-grand@example.com" });
    const plan = await createTestPlan();
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    // permanent (expiresAt = null) purchase, granted 100 days ago
    await createTestPurchase(user.id, plan.id, order.id, {
      grantedAt: new Date(Date.now() - 100 * DAY),
    });
    const course = await createTestCourse();
    // course removed 50 days ago — after the purchase
    await linkCourseToPlan(course.id, plan.id, {
      removedAt: new Date(Date.now() - 50 * DAY),
    });

    const rows = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(rows).toEqual([{ planId: plan.id, grandfathered: true }]);

    const result = await checkCourseAccess(course.id, user.id, user.email);
    expect(result.hasAccess).toBe(true);
    expect(await listLocallyEligibleUserIdsForCourse(course.id)).toContain(user.id);
  });

  it("M-1: EXPIRED grant before course removal → access DENIED", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-ca-expired@example.com" });
    const plan = await createTestPlan();
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    // manual grant: granted 100 days ago, but EXPIRED 30 days ago
    await createTestPurchase(user.id, plan.id, order.id, {
      grantedBy: "manual",
      grantedAt: new Date(Date.now() - 100 * DAY),
      expiresAt: new Date(Date.now() - 30 * DAY),
    });
    const course = await createTestCourse();
    // course removed 50 days ago — purchase predates removal, but is expired
    await linkCourseToPlan(course.id, plan.id, {
      removedAt: new Date(Date.now() - 50 * DAY),
    });

    const rows = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    // grandfather must NOT resurrect an expired grant
    expect(rows).toEqual([]);

    const result = await checkCourseAccess(course.id, user.id, user.email);
    expect(result.hasAccess).toBe(false);
    expect(await listLocallyEligibleUserIdsForCourse(course.id)).not.toContain(user.id);
  });

  it("purchase AFTER course removal → no grandfather (no access)", async () => {
    await cleanTestData();
    const user = await createTestUser({ email: "test-ca-after@example.com" });
    const plan = await createTestPlan();
    const order = await createTestOrder(user.id, plan.id, { status: "completed" });
    // valid permanent grant, but granted only 10 days ago (after removal)
    await createTestPurchase(user.id, plan.id, order.id, {
      grantedAt: new Date(Date.now() - 10 * DAY),
    });
    const course = await createTestCourse();
    // removed 50 days ago — purchase (10 days ago) does NOT predate removal
    await linkCourseToPlan(course.id, plan.id, {
      removedAt: new Date(Date.now() - 50 * DAY),
    });

    const rows = await getAccessiblePlanIdsForCourse(course.id, user.id, user.email);
    expect(rows).toEqual([]);

    const result = await checkCourseAccess(course.id, user.id, user.email);
    expect(result.hasAccess).toBe(false);
    expect(await listLocallyEligibleUserIdsForCourse(course.id)).not.toContain(user.id);
  });
});
