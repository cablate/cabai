import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoScenarios, HeroSection } from "./hero";
import { HomeStartSection } from "./home-start";
import { HomeLibrarySection } from "./home-library";

describe("homepage landing contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("shows the core promise, both primary actions, and the live product proof", () => {
    const { unmount } = render(<HeroSection />);

    expect(
      screen.getByRole("heading", { level: 1, name: /你學會的內容.*讓 AI 接著用/ }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "看看有哪些內容" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByRole("link", { name: "設定 Agent API" })).toHaveAttribute(
      "href",
      "/dashboard/settings/agent",
    );
    expect(screen.getByLabelText("CabAI Agent API 使用示範")).toBeVisible();

    unmount();
  });

  it("keeps the follow-up choices to three concise destinations", () => {
    render(<HomeStartSection />);

    const navigation = screen.getByRole("navigation", { name: "CabAI 內容入口" });
    const links = within(navigation).getAllByRole("link");

    expect(links).toHaveLength(3);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/products",
      "/library",
      "/dashboard/settings/agent",
    ]);
  });

  it("uses the registered User Agent course content route in the homepage demo", () => {
    const courseScenario = demoScenarios.find((scenario) => scenario.id === "course");

    expect(courseScenario).toMatchObject({
      endpoint: "GET /api/agent/courses/{id}/content",
    });
    expect(courseScenario?.endpoint).not.toContain("/api/agent/v1/courses");
    expect(courseScenario?.answer).toContain("已授權的 course id");
  });

  it("shows a compact Library entry with crawlable detail links", () => {
    render(
      <HomeLibrarySection
        entries={[
          {
            id: "entry-1",
            slug: "agent-guide",
            title: "Agent 使用指南",
            summary: "一篇可直接閱讀的指南。",
            tags: ["Agent"],
            featured: true,
            revision: 1,
            publishedAt: new Date("2026-07-30T00:00:00.000Z"),
            updatedAt: new Date("2026-07-30T00:00:00.000Z"),
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "最近整理的內容" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Agent 使用指南" })).toHaveAttribute(
      "href",
      "/library/agent-guide",
    );
  });

  it("moves to the next conversation two seconds after the answer appears", () => {
    const { unmount } = render(<HeroSection />);
    const courseScenario = screen.getByRole("button", { name: "已購課程" });
    const skillScenario = screen.getByRole("button", { name: "工作 Skill" });

    expect(courseScenario).toHaveAttribute("aria-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(3719);
    });
    expect(courseScenario).toHaveAttribute("aria-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(skillScenario).toHaveAttribute("aria-pressed", "true");

    unmount();
  });
});
