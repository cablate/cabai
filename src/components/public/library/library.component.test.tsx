import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryPublicDetail, LibraryPublicSummary } from "@/lib/services/library-service";
import { LibraryDetail } from "./library-detail";
import { LibraryErrorState } from "./library-error-state";
import { LibraryIndex } from "./library-index";
import { LibraryDetailLoading, LibraryListLoading } from "./library-loading";
import { LibraryMarkdown } from "./library-markdown";

function summary(overrides: Partial<LibraryPublicSummary> = {}): LibraryPublicSummary {
  return {
    id: "entry-1", slug: "reliable-agent-workflows", title: "可靠的 Agent 工作流",
    summary: "把一次性的操作整理成可以驗證與重複執行的方法。", tags: ["Agent", "工程方法"], featured: false,
    revision: 1, publishedAt: new Date("2026-07-16T08:00:00.000Z"), updatedAt: new Date("2026-07-16T08:00:00.000Z"),
    ...overrides,
  };
}

describe("LibraryIndex", () => {
  it("groups every entry once into featured or latest and exposes simple topic labels", () => {
    render(<LibraryIndex entries={[
      summary({ id: "featured", slug: "featured", title: "精選方法", featured: true }),
      summary({ id: "latest", slug: "latest", title: "最新方法", tags: ["測試"] }),
    ]} />);
    const featured = screen.getByRole("region", { name: "精選文章" });
    const latest = screen.getByRole("region", { name: "最新文章" });
    expect(within(featured).getByRole("link", { name: "精選方法" })).toHaveAttribute("href", "/library/featured");
    expect(within(latest).getByRole("link", { name: "最新方法" })).toHaveAttribute("href", "/library/latest");
    expect(screen.getAllByRole("link", { name: "精選方法" })).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Library 主題" })).toHaveTextContent("測試");
  });

  it("explains the empty published state without presenting a collection", () => {
    render(<LibraryIndex entries={[]} />);
    expect(screen.getByRole("heading", { level: 2, name: "文章正在整理中" })).toBeInTheDocument();
    expect(screen.getByText(/目前還沒有已發布的文章/)).toBeInTheDocument();
    expect(screen.queryByText(/Collection/i)).not.toBeInTheDocument();
  });
});

describe("Library detail and Markdown", () => {
  it("renders published metadata, tags, and article content", () => {
    const entry: LibraryPublicDetail = { ...summary(), bodyMarkdown: "## 可驗證的步驟\n\n先定義結果，再執行。" };
    render(<LibraryDetail entry={entry} />);
    expect(screen.getByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();
    expect(screen.getByText(entry.summary)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "文章標籤" })).toHaveTextContent("工程方法");
    expect(screen.getByRole("heading", { level: 2, name: "可驗證的步驟" })).toBeInTheDocument();
    expect(screen.getByText(/發布於/).closest("time")).toHaveAttribute("datetime", entry.publishedAt?.toISOString());
    expect(screen.getByText("約 1 分鐘閱讀")).toBeInTheDocument();
    expect(screen.queryByText(/更新於/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "返回 Library" })).toHaveLength(1);
    expect(screen.queryByText("Agent 讀取提示")).not.toBeInTheDocument();
    expect(screen.queryByText("內容修訂")).not.toBeInTheDocument();
  });

  it("shows a meaningful post-publication update without adding another H1", () => {
    const entry: LibraryPublicDetail = {
      ...summary({ updatedAt: new Date("2026-07-18T08:00:00.000Z") }),
      bodyMarkdown: "# 內文標題\n\n內容",
    };
    render(<LibraryDetail entry={entry} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "內文標題" })).toBeInTheDocument();
    expect(screen.getByText(/更新於/).closest("time")).toHaveAttribute(
      "datetime",
      entry.updatedAt.toISOString(),
    );
  });

  it("shows at most the supplied related links with an honest relationship label", () => {
    const entry: LibraryPublicDetail = {
      ...summary(),
      bodyMarkdown: "文章內容",
    };
    render(
      <LibraryDetail
        entry={entry}
        relatedByTag
        relatedEntries={[
          summary({ id: "related-1", slug: "related-1", title: "相關方法一" }),
          summary({ id: "related-2", slug: "related-2", title: "相關方法二" }),
        ]}
      />,
    );

    const region = screen.getByRole("complementary", { name: "相關文章" });
    expect(within(region).getByRole("link", { name: "相關方法一" })).toHaveAttribute(
      "href",
      "/library/related-1",
    );
    expect(within(region).getByRole("link", { name: "相關方法二" })).toHaveAttribute(
      "href",
      "/library/related-2",
    );
  });

  it("blocks images and raw HTML while keeping relative and safe external links", () => {
    render(<LibraryMarkdown content={'[站內說明](/library/inside) [外部文件](https://example.com/docs) [不安全](javascript:alert(1))\n\n![不應顯示](https://example.com/image.png)\n\n<span>不應渲染的 HTML</span>'} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("不應渲染的 HTML").tagName).toBe("P");
    expect(screen.getByRole("link", { name: "站內說明" })).toHaveAttribute("href", "/library/inside");
    expect(screen.getByRole("link", { name: "站內說明" })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "外部文件" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "外部文件" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("不安全").closest("a")).toBeNull();
  });
});

describe("Library route states", () => {
  it("exposes shape-matched list and detail loading states", () => {
    const { rerender } = render(<LibraryListLoading />);
    expect(screen.getByLabelText("正在載入 Library")).toHaveAttribute("aria-busy", "true");

    rerender(<LibraryDetailLoading />);
    expect(screen.getByLabelText("正在載入 Library 文章")).toHaveAttribute("aria-busy", "true");
  });

  it("offers semantic retry and Library recovery controls", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<LibraryErrorState reset={reset} detail errorId="error-123" />);

    await user.click(screen.getByRole("button", { name: "再試一次" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "回到 Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByText("error-123")).toBeInTheDocument();
  });
});
