import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlan: vi.fn(),
  resolvePlan: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  BRAND_NAME: "山間攝影教室", CREATOR_NAME: "Site Creator", CREATOR_URL: "https://example.com",
}));
vi.mock("@/lib/config/public-branding", () => ({
  PUBLIC_BRANDING: { socialImage: "/site/photography-share.png" },
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/access", () => ({ checkPlanAccess: vi.fn(), getEntitledPlanIds: vi.fn() }));
vi.mock("@/lib/plans-local", () => ({ resolvePlanByIdOrSlug: mocks.resolvePlan }));
vi.mock("@/lib/delivery", () => ({ getDeliveryOverviewForPlan: vi.fn() }));
vi.mock("@/lib/event-tracking", () => ({ recordEvent: vi.fn() }));
vi.mock("@/lib/queries/course-catalog", () => ({
  getPublishedCourseSyllabusForPlan: vi.fn(), getPublishedCourseStatsForPlan: vi.fn(),
}));
vi.mock("@/lib/plan-presentations", () => ({
  getPlanWithPresentation: mocks.getPlan, getPublishedPlanPresentations: vi.fn(),
  isPublicPlanPresentation: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePlan.mockResolvedValue({ id: "plan-1" });
});

describe("configured public share image", () => {
  it("uses the configured image in product catalog metadata", async () => {
    const { metadata } = await import("./page");
    expect(metadata.openGraph?.images).toEqual([
      { url: "/site/photography-share.png", width: 1200, height: 630, alt: "山間攝影教室" },
    ]);
    expect(metadata.twitter?.images).toEqual(["/site/photography-share.png"]);
  });

  it.each([
    [null, null, "/site/photography-share.png"],
    [null, "/site/plan-cover.png", "/site/plan-cover.png"],
    ["/site/presentation-cover.png", "/site/plan-cover.png", "/site/presentation-cover.png"],
  ])("preserves cover priority (case %#)", async (coverImage, image, expected) => {
    mocks.getPlan.mockResolvedValue({
      plan: { id: "plan-1", slug: "photo", name: "Photo course", image },
      presentation: { title: "Photo course", subtitle: "A sample course", offeringType: "course", coverImage },
    });
    const { generateMetadata } = await import("./[id]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "photo" }), searchParams: Promise.resolve({}),
    });
    expect(metadata.openGraph?.images).toEqual([
      expected === "/site/photography-share.png"
        ? { url: expected, width: 1200, height: 630, alt: "山間攝影教室" }
        : { url: expected, alt: "Photo course" },
    ]);
    expect(metadata.twitter?.images).toEqual([expected]);
  });
});
