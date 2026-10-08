import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { PublicInformationItem } from "@/lib/services/information-service";
import { InformationIndex } from "./information-index";

const item: PublicInformationItem = {
  id: "information-1",
  kind: "library.published",
  title: "新的 Agent API 使用指南",
  summary: "從 Library 了解如何取得最新的公開資源。",
  whyItMatters: "讓 AI 可以依照公告找到對應的內容。",
  bodyMarkdown: "# 完整公告\n\n這是提供給人類與 AI 閱讀的完整內容。",
  tags: ["Agent API"],
  publishedAt: new Date("2026-07-18T00:00:00.000Z"),
  href: "/library/agent-api-guide",
};

describe("public Information page", () => {
  it("keeps cards concise and opens the full content in an accessible reading panel", async () => {
    const user = userEvent.setup();
    render(<InformationIndex items={[item]} />);

    expect(screen.getByRole("heading", { name: "最新消息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: item.title })).toBeInTheDocument();
    expect(screen.getByText(item.summary)).toBeInTheDocument();
    expect(screen.queryByText(item.whyItMatters)).not.toBeInTheDocument();
    expect(screen.queryByText("完整公告")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /前往相關內容/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `閱讀全文：${item.title}` }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: item.title })).toBeInTheDocument();
    expect(screen.getByText("完整公告")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /前往相關內容/ })).toHaveAttribute("href", item.href);
    expect(within(screen.getByRole("dialog")).getByText("Library")).toBeInTheDocument();
  });

  it("shows a calm empty state without unread controls", () => {
    render(<InformationIndex items={[]} />);

    expect(screen.getByRole("heading", { name: "目前還沒有公開消息" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /已讀|標記/ })).not.toBeInTheDocument();
  });
});
