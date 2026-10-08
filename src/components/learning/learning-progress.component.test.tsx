import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LearningProgress } from "./learning-progress";

describe("LearningProgress", () => {
  it("exposes visible and accessible progress", () => {
    render(<LearningProgress completed={9} total={32} />);
    expect(screen.getByText("9/32 已完成")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "課程完成進度" })).toHaveAttribute("aria-valuenow", "28");
  });
});
