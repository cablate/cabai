import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Plan, PlanPresentation } from "@/lib/db/schema";

vi.mock("./offering-card", () => ({
  OfferingCard: ({ presentation }: { presentation: PlanPresentation }) => (
    <article>{presentation.title}</article>
  ),
}));

import { OfferingGrid } from "./offering-grid";
import { ProductStartGuide } from "./product-start-guide";

function item(id: string, offeringType: PlanPresentation["offeringType"]) {
  return {
    plan: {
      id,
      status: "active",
      amount: 0,
    } as Plan,
    presentation: {
      id: `presentation-${id}`,
      planId: id,
      title: `內容 ${id}`,
      offeringType,
    } as PlanPresentation,
    courseStats: null,
  };
}

describe("ProductStartGuide", () => {
  it("keeps free resources available without duplicating the product catalogue", () => {
    render(<ProductStartGuide />);

    expect(screen.getByText("想先從免費內容開始？")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /瀏覽免費資源/ })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getByRole("link", { name: /查看免費 Skill/ })).toHaveAttribute(
      "href",
      "/skills",
    );
    expect(screen.queryByText("完整學習與實作")).not.toBeInTheDocument();
  });
});

describe("OfferingGrid", () => {
  it("renders an intentional empty state when no public offerings exist", () => {
    const { container } = render(<OfferingGrid items={[]} />);

    expect(container.textContent?.trim()).not.toBe("");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("does not show redundant filters for a single-type catalogue", () => {
    render(
      <OfferingGrid
        items={[item("course-1", "course"), item("course-2", "course")]}
      />,
    );

    expect(screen.queryByRole("group", { name: "內容形式" })).not.toBeInTheDocument();
    expect(screen.getByText("內容 course-1")).toBeInTheDocument();
    expect(screen.getByText("內容 course-2")).toBeInTheDocument();
  });

  it("shows filters when visitors can switch between actual content types", () => {
    render(
      <OfferingGrid
        items={[item("course-1", "course"), item("download-1", "download")]}
      />,
    );

    expect(screen.getByRole("group", { name: "內容形式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /全部/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /線上課程/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下載資源/ })).toBeInTheDocument();
  });
});
