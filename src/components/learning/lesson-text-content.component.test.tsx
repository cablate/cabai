import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LessonTextContent } from "./lesson-text-content";

describe("LessonTextContent", () => {
  it("renders reading progress and direct heading links for long text lessons", () => {
    render(
      <LessonTextContent
        title="建立工作流"
        content={[
          "# 建立工作流",
          "前言",
          "## 準備環境",
          "內容",
          "## 執行驗證",
          "內容",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "本堂閱讀進度" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("link", { name: "準備環境" })).toHaveAttribute(
      "href",
      "#準備環境",
    );
    expect(screen.getByRole("heading", { name: "準備環境" })).toHaveAttribute(
      "id",
      "準備環境",
    );
    expect(
      screen.queryByRole("heading", { name: "建立工作流" }),
    ).not.toBeInTheDocument();
  });

  it("does not render an empty table of contents for short text", () => {
    render(<LessonTextContent content="只有一段文字。" />);

    expect(screen.getByText("閱讀進度")).toBeInTheDocument();
    expect(screen.queryByText("本堂目錄")).not.toBeInTheDocument();
  });
});
