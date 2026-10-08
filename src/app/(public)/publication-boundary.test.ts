import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type * as PlanPresentations from "@/lib/plan-presentations";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), getPlan: vi.fn(), resolvePlan: vi.fn(), access: vi.fn(),
  delivery: vi.fn(), order: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/portaly", () => ({ PORTALY_MODE: "test" }));
vi.mock("@/lib/plans-local", () => ({ resolvePlanByIdOrSlug: mocks.resolvePlan }));
vi.mock("@/lib/plan-presentations", async (original) => ({
  ...await original<typeof PlanPresentations>(),
  getPlanWithPresentation: mocks.getPlan,
}));
vi.mock("@/lib/access", () => ({ checkPlanAccess: mocks.access }));
vi.mock("@/lib/delivery", () => ({ getDeliveryOverviewForPlan: mocks.delivery }));
vi.mock("@/lib/reconcile", () => ({ reconcileOrder: mocks.reconcile }));
vi.mock("@/lib/queries/course-catalog", () => ({ getPublishedCourseStatsForPlan: vi.fn() }));
vi.mock("@/components/checkout/checkout-offering-summary", () => ({ CheckoutOfferingSummary: () => null }));
vi.mock("@/components/checkout/checkout-delivery-expectation", () => ({ CheckoutDeliveryExpectation: () => null }));
vi.mock("@/components/checkout/checkout-payment-summary", () => ({ CheckoutPaymentSummary: () => null }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: mocks.order }) }) }) }),
  query: { discordRoleMappings: { findMany: vi.fn(async () => []) }, userDiscordLinks: { findFirst: vi.fn(async () => null) } },
} }));

import Checkout from "./checkout/[productId]/page";
import Success from "./success/page";
import Cancel from "./cancel/page";

const plan = { id: "plan-1", status: "active", name: "Public plan", purchaseButtonMode: "default" };
const presentation = { title: "Sensitive presentation", offeringType: "download", publishedAt: new Date("2020-01-01"), deletedAt: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
  mocks.resolvePlan.mockResolvedValue(plan);
  mocks.getPlan.mockResolvedValue({ plan, presentation });
  mocks.access.mockResolvedValue({ hasAccess: false });
  mocks.delivery.mockResolvedValue({ courses: [], contents: [], services: [], courseCount: 0, lessonCount: 0 });
});

describe("public checkout/return presentation visibility", () => {
  it("does not treat an arbitrary success URL as payment evidence", async () => {
    const generic = await Success({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(generic);
    expect(html).toContain("此頁連結無法確認付款");
    expect(html).not.toContain("訂單已確認");
    expect(html).not.toContain("付款成功");
  });
  it.each([
    { ...presentation, publishedAt: null },
    { ...presentation, publishedAt: new Date("2999-01-01") },
    { ...presentation, deletedAt: new Date() },
    null,
  ])("does not expose a draft, scheduled, deleted or absent presentation (%#)", async (hidden) => {
    mocks.getPlan.mockResolvedValue({ plan, presentation: hidden });
    await expect(Checkout({ params: Promise.resolve({ productId: plan.id }) })).rejects.toThrow("NOT_FOUND");
    mocks.auth.mockResolvedValue(null);
    await expect(Success({ searchParams: Promise.resolve({ planId: plan.id }) })).rejects.toThrow("REDIRECT:/");
    const cancel = await Cancel({ searchParams: Promise.resolve({ planId: plan.id }) });
    expect(renderToStaticMarkup(cancel)).not.toContain(presentation.title);
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("retains published checkout and anonymous return metadata", async () => {
    const checkout = await Checkout({ params: Promise.resolve({ productId: plan.id }) });
    expect(renderToStaticMarkup(checkout)).toContain(presentation.title);
    mocks.auth.mockResolvedValue(null);
    const success = await Success({ searchParams: Promise.resolve({ planId: plan.id }) });
    expect(success.props.presentation).toEqual(presentation);
    const cancel = await Cancel({ searchParams: Promise.resolve({ planId: plan.id }) });
    expect(renderToStaticMarkup(cancel)).toContain(presentation.title);
  });

  it("does not expose an inactive plan through anonymous return URLs", async () => {
    mocks.getPlan.mockResolvedValue({ plan: { ...plan, status: "inactive" }, presentation });
    await expect(Success({ searchParams: Promise.resolve({ planId: plan.id }) })).rejects.toThrow("REDIRECT:/");
    expect(renderToStaticMarkup(await Cancel({ searchParams: Promise.resolve({ planId: plan.id }) }))).not.toContain(presentation.title);
  });

  it("preserves the authenticated owned-order handoff for historic presentations", async () => {
    mocks.order.mockResolvedValue([{ id: "order-1", merchantOrderNumber: "owned-order", planId: plan.id, status: "completed" }]);
    const historic = { ...presentation, publishedAt: null };
    mocks.getPlan.mockResolvedValue({ plan: { ...plan, status: "inactive" }, presentation: historic });
    const result = await Success({ searchParams: Promise.resolve({ order: "owned-order" }) });
    expect(mocks.reconcile).toHaveBeenCalledWith("owned-order", "member-1");
    expect(result.props.presentation).toEqual(historic);
  });

  it("preserves entitled checkout redirection instead of hiding existing purchases", async () => {
    mocks.access.mockResolvedValue({ hasAccess: true });
    mocks.getPlan.mockResolvedValue({ plan, presentation: null });
    await expect(Checkout({ params: Promise.resolve({ productId: plan.id }) })).rejects.toThrow("REDIRECT:/my/plan-1");
  });
});
