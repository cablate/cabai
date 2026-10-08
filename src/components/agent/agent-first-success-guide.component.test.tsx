import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentFirstSuccessGuide } from "./agent-first-success-guide";

describe("AgentFirstSuccessGuide", () => {
  it("explains the first authenticated read and copies only safe request details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <AgentFirstSuccessGuide
        hasToken
        hasUsedToken={false}
      />,
    );

    expect(screen.getByText("第一次成功：先讓 AI 讀到一筆資料")).toBeInTheDocument();
    expect(screen.getByText("查看完整指令")).toBeInTheDocument();
    expect(screen.getByText("查看完整指令").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/cab_user_/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /User Agent OpenAPI/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "給 AI 的串接指令：複製" }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/api/agent/user/v1/openapi.yaml"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/api/agent/user/v1/information?state=unread&limit=20"),
    );
    expect(screen.getByRole("button", { name: "給 AI 的串接指令：複製" })).toHaveTextContent("已複製");
  });

  it("offers a path to token creation when no token exists", async () => {
    const onCreateToken = vi.fn();

    render(
      <AgentFirstSuccessGuide
        hasToken={false}
        hasUsedToken={false}
        onCreateToken={onCreateToken}
      />,
    );

    expect(screen.queryByRole("button", { name: "給 AI 的串接指令：複製" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "前往建立權杖" }));
    expect(onCreateToken).toHaveBeenCalledOnce();
  });

  it("refreshes an unused token status and reports only the proven success", async () => {
    const onRefreshStatus = vi.fn();
    const { rerender } = render(
      <AgentFirstSuccessGuide
        hasToken
        hasUsedToken={false}
        onRefreshStatus={onRefreshStatus}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "重新確認使用狀態" }));
    expect(onRefreshStatus).toHaveBeenCalledOnce();

    rerender(
      <AgentFirstSuccessGuide
        hasToken
        hasUsedToken
        onRefreshStatus={onRefreshStatus}
      />,
    );

    expect(screen.getByText("已偵測到有效 API 使用")).toBeInTheDocument();
    expect(screen.queryByText(/完成 ACK/)).not.toBeInTheDocument();
  });
});
