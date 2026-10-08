import { describe, expect, it } from "vitest";
import {
  extractMarkdownHeadings,
  headingSlug,
} from "./markdown-headings";

describe("markdown heading helpers", () => {
  it("creates readable Traditional Chinese anchors", () => {
    expect(headingSlug("開始建立 Agent 工作流")).toBe(
      "開始建立-agent-工作流",
    );
  });

  it("ignores fenced code and gives repeated headings stable unique ids", () => {
    expect(
      extractMarkdownHeadings(
        [
          "# 課堂標題",
          "## 設定",
          "```md",
          "## 不是目錄",
          "```",
          "## 設定",
        ].join("\n"),
        true,
      ),
    ).toEqual([
      { level: 2, text: "課堂標題", id: "課堂標題", line: 1 },
      { level: 2, text: "設定", id: "設定", line: 2 },
      { level: 2, text: "設定", id: "設定-2", line: 6 },
    ]);
  });
});
