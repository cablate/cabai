import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  brandName: "CabAI",
  auth: vi.fn(),
  libraryEntry: vi.fn(),
  libraryList: vi.fn(),
  image: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  get BRAND_NAME() { return mocks.brandName; },
  CREATOR_NAME: "Site Creator",
  CREATOR_URL: "https://example.com",
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/config/site-identity", () => ({ CONTACT_EMAIL: "support@example.com" }));
vi.mock("@/components/track-action", () => ({
  TrackAction: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/services/library-service", () => ({
  getPublishedLibraryEntry: mocks.libraryEntry,
  listPublishedLibraryEntries: mocks.libraryList,
}));
vi.mock("@/lib/app-url", () => ({ getAppBaseUrl: () => "https://example.com" }));
vi.mock("@/lib/config/public-branding", () => ({
  PUBLIC_BRANDING: {
    description: "A neutral description", logo: "/oss/icon.svg",
    illustration: "/oss/learning.svg", socialImage: "/site/test-share.png",
  },
}));
vi.mock("@/lib/public-site-cache", () => ({
  getCachedPublishedLibraryEntries: vi.fn(), getCachedPublishedPlanPresentations: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ getEntitledPlanIds: vi.fn() }));
vi.mock("@/lib/services/skill-release-service", () => ({ listPublicSkills: vi.fn() }));
vi.mock("@/lib/services/information-service", () => ({ listPublishedPublicInformation: vi.fn() }));
vi.mock("@/components/public/library/library-detail", () => ({ LibraryDetail: () => null }));
vi.mock("@/components/public/library/library-index", () => ({ LibraryIndex: () => null }));
vi.mock("@/components/public/skills/skill-catalog", () => ({ SkillList: () => null }));
vi.mock("@/components/public/information/information-index", () => ({ InformationIndex: () => null }));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: unknown) {
      mocks.image(element, options);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.libraryEntry.mockResolvedValue({
    ok: true,
    value: {
      slug: "sample", title: "Sample guide", summary: "A neutral summary", tags: [],
      publishedAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"),
    },
  });
  mocks.libraryList.mockResolvedValue({ ok: true, value: [] });
});

describe.each(["CabAI", "山間攝影教室"])("public page identity: %s", (brandName) => {
  beforeEach(() => { mocks.brandName = brandName; });

  it("uses the selected brand for the hero copy and accessible demo label", async () => {
    const { HeroSection } = await import("./sections/hero");
    const html = renderToStaticMarkup(<HeroSection />);
    expect(html).toContain(`${brandName} Knowledge Hub`);
    expect(html).toContain(`課程和資源留在 ${brandName}`);
    expect(html).toContain(`aria-label="${brandName} Agent API 使用示範"`);
    expect(html).toContain(`你的 AI · ${brandName}`);
    if (brandName !== "CabAI") expect(html).not.toContain("CabAI");
  });

  it("uses the selected brand in community metadata, actions and support subject", async () => {
    const { default: CommunityPage, metadata } = await import("./community/page");
    expect(metadata.openGraph).toMatchObject({
      title: `${brandName} 學習社群`,
      description: `在 ${brandName} 連結 Discord，課後繼續討論問題、分享實作。`,
    });
    const html = renderToStaticMarkup(await CommunityPage());
    expect(html).toContain(`建立 ${brandName} 帳號並連結 Discord`);
    expect(html).toContain(`先看 ${brandName} 免費試看與內容`);
    expect(html).toContain(encodeURIComponent(`${brandName} 社群連結協助`));
    if (brandName !== "CabAI") expect(html).not.toContain("CabAI");
  });

  it("brands the library share image without a maintainer-domain fallback", async () => {
    const { GET } = await import("./library/[slug]/social-image/route");
    await GET(new Request("https://example.com/library/sample/social-image"), {
      params: Promise.resolve({ slug: "sample" }),
    });
    const html = renderToStaticMarkup(mocks.image.mock.calls[0]![0]);
    expect(html).toContain(`${brandName} Library`);
    expect(html).toContain("Sample guide");
    expect(html).not.toContain("cabai.net");
    if (brandName !== "CabAI") expect(html).not.toContain("CabAI");
    expect(mocks.image.mock.calls[0]![1]).toMatchObject({ width: 1200, height: 630 });
  });

  it("uses the selected brand in library, skills and information metadata", async () => {
    const pages = await Promise.all([
      import("./library/page"), import("./skills/page"), import("./information/page"),
    ]);
    for (const { metadata } of pages) {
      expect(metadata.description).toContain(brandName);
      expect(metadata.openGraph?.title).toContain(brandName);
      if (brandName !== "CabAI") expect(JSON.stringify(metadata)).not.toContain("CabAI");
    }
  });

  it("uses the configured public share image in homepage metadata", async () => {
    const { metadata } = await import("./page");
    expect(metadata.openGraph?.images).toEqual([
      { url: "/site/test-share.png", width: 1200, height: 630, alt: brandName },
    ]);
    expect(metadata.twitter?.images).toEqual(["/site/test-share.png"]);
  });

  it("uses the selected brand for the library breadcrumb home item", async () => {
    const { default: LibraryDetailPage } = await import("./library/[slug]/page");
    const page = await LibraryDetailPage({ params: Promise.resolve({ slug: "sample" }) });
    const html = renderToStaticMarkup(page);
    const scripts = Array.from(html.matchAll(/<script[^>]*>(.*?)<\/script>/g))
      .map((match) => JSON.parse(match[1]!));
    const breadcrumb = scripts.find((schema) => schema["@type"] === "BreadcrumbList");
    expect(breadcrumb.itemListElement[0]).toMatchObject({
      name: brandName, item: "https://example.com/",
    });
    if (brandName !== "CabAI") expect(html).not.toContain("CabAI");
  });

  it("uses the selected brand in the shared visible and structured FAQ data", async () => {
    const { faqs } = await import("./sections/faq-data");
    const { faqPageSchema } = await import("@/lib/seo/json-ld");
    expect(faqs[0]!.q).toBe(`沒有 Agent API，也可以使用 ${brandName} 嗎？`);
    expect(faqs[0]!.a).toContain(`不是使用 ${brandName} 的前提`);
    expect(faqs[1]!.a).toContain(`依 ${brandName} 帳號權限判斷`);
    const schema = faqPageSchema(faqs);
    expect(schema.mainEntity[0]!.name).toBe(faqs[0]!.q);
    if (brandName !== "CabAI") expect(JSON.stringify(schema)).not.toContain("CabAI");
  });
});

it("retains the library image 404 when the entry is not published", async () => {
  mocks.libraryEntry.mockResolvedValue({ ok: false });
  const { GET } = await import("./library/[slug]/social-image/route");
  const response = await GET(new Request("https://example.com/library/missing/social-image"), {
    params: Promise.resolve({ slug: "missing" }),
  });
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(404);
  expect(mocks.image).not.toHaveBeenCalled();
});
