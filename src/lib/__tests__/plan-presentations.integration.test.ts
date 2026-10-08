import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  plans,
  planPresentations,
  type NewPlanPresentation,
} from "@/lib/db/schema";
import { cleanTestData, createTestPlan } from "@/test/helpers";
import {
  getFeaturedPlanPresentations,
  getAllPublishedPlanPresentations,
  getPlanPresentationsByType,
  getPlanWithPresentation,
  getPublishedPlanPresentations,
  isPublicPlanPresentation,
} from "@/lib/plan-presentations";

const createdPlanIds: string[] = [];

async function cleanup() {
  await cleanTestData();
  for (const planId of createdPlanIds) {
    await db.delete(plans).where(eq(plans.id, planId)).catch(() => {});
  }
  createdPlanIds.length = 0;
}

async function createPlan(
  overrides: Parameters<typeof createTestPlan>[0] = {},
) {
  const plan = await createTestPlan(overrides);
  createdPlanIds.push(plan.id);
  return plan;
}

async function createPresentation(
  planId: string,
  overrides: Partial<NewPlanPresentation> = {}
) {
  const [presentation] = await db
    .insert(planPresentations)
    .values({
      planId,
      offeringType: "course",
      title: `Presentation ${planId}`,
      publishedAt: new Date(Date.now() - 60_000),
      ...overrides,
    })
    .returning();

  return presentation!;
}

beforeAll(cleanup);
afterEach(cleanup);
afterAll(cleanup);

describe("plan presentation public visibility", () => {
  it("returns featured banner items only when plan is active, published, not deleted, and featured", async () => {
    const first = await createPlan();
    await createPresentation(first.id, {
      isFeatured: true,
      featuredSortOrder: 1,
    });

    const second = await createPlan();
    await createPresentation(second.id, {
      isFeatured: true,
      featuredSortOrder: 2,
    });

    const inactive = await createPlan({ status: "inactive" });
    await createPresentation(inactive.id, {
      isFeatured: true,
      featuredSortOrder: 0,
    });

    const draft = await createPlan();
    await createPresentation(draft.id, {
      isFeatured: true,
      publishedAt: null,
    });

    const scheduled = await createPlan();
    await createPresentation(scheduled.id, {
      isFeatured: true,
      publishedAt: new Date(Date.now() + 60_000),
    });

    const hidden = await createPlan();
    await createPresentation(hidden.id, {
      isFeatured: false,
    });

    const deleted = await createPlan();
    await createPresentation(deleted.id, {
      isFeatured: true,
      deletedAt: new Date(),
    });

    const results = await getFeaturedPlanPresentations();

    expect(results.map((item) => item.plan.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("returns published list items only when the public visibility gate passes", async () => {
    const visible = await createPlan();
    await createPresentation(visible.id);

    const inactive = await createPlan({ status: "inactive" });
    await createPresentation(inactive.id);

    const draft = await createPlan();
    await createPresentation(draft.id, { publishedAt: null });

    const scheduled = await createPlan();
    await createPresentation(scheduled.id, {
      publishedAt: new Date(Date.now() + 60_000),
    });

    const deleted = await createPlan();
    await createPresentation(deleted.id, { deletedAt: new Date() });

    await createPlan({ slug: "missing-presentation" });

    const results = await getPublishedPlanPresentations();

    expect(results.map((item) => item.plan.id)).toEqual([visible.id]);
  });

  it("uses the same visibility gate for the uncapped sitemap query", async () => {
    const visible = await createPlan();
    await createPresentation(visible.id);

    const inactive = await createPlan({ status: "inactive" });
    await createPresentation(inactive.id);

    const draft = await createPlan();
    await createPresentation(draft.id, { publishedAt: null });

    const results = await getAllPublishedPlanPresentations();

    expect(results.map((item) => item.plan.id)).toEqual([visible.id]);
  });

  it("applies the same public visibility gate to type-specific published queries", async () => {
    const visibleCourse = await createPlan();
    await createPresentation(visibleCourse.id, { offeringType: "course" });

    const visibleService = await createPlan();
    await createPresentation(visibleService.id, { offeringType: "service" });

    const inactiveCourse = await createPlan({ status: "inactive" });
    await createPresentation(inactiveCourse.id, { offeringType: "course" });

    const results = await getPlanPresentationsByType("course", true);

    expect(results.map((item) => item.plan.id)).toEqual([visibleCourse.id]);
  });

  it("identifies public detail-page visibility consistently", async () => {
    const plan = await createPlan();
    const presentation = await createPresentation(plan.id);

    expect(isPublicPlanPresentation({ status: "active" }, presentation)).toBe(
      true
    );
    expect(isPublicPlanPresentation({ status: "inactive" }, presentation)).toBe(
      false
    );
    expect(
      isPublicPlanPresentation(
        { status: "active" },
        { ...presentation, publishedAt: null }
      )
    ).toBe(false);
    expect(
      isPublicPlanPresentation(
        { status: "active" },
        { ...presentation, deletedAt: new Date() }
      )
    ).toBe(false);
    expect(
      isPublicPlanPresentation(
        { status: "active" },
        { ...presentation, publishedAt: new Date(Date.now() + 60_000) }
      )
    ).toBe(false);
    expect(isPublicPlanPresentation({ status: "active" }, null)).toBe(false);
  });

  it("keeps a published AgentSkill fixture public and a presentation-less Payment fixture private", async () => {
    const agentSkill = await createPlan({ slug: "agentskill-course" });
    await createPresentation(agentSkill.id);
    const payment = await createPlan({ slug: "payment-integration" });

    const agentSkillDetail = await getPlanWithPresentation(agentSkill.id);
    const paymentDetail = await getPlanWithPresentation(payment.id);
    const catalogue = await getPublishedPlanPresentations();

    expect(
      isPublicPlanPresentation(
        agentSkillDetail.plan,
        agentSkillDetail.presentation,
      ),
    ).toBe(true);
    expect(
      isPublicPlanPresentation(paymentDetail.plan, paymentDetail.presentation),
    ).toBe(false);
    expect(catalogue.map(({ plan }) => plan.slug)).toContain("agentskill-course");
    expect(catalogue.map(({ plan }) => plan.slug)).not.toContain(
      "payment-integration",
    );
  });
});
