import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstAdminBootstrapCard } from "./first-admin-bootstrap-card";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("FirstAdminBootstrapCard", () => {
  it("explains the disabled state without rendering a token form", () => {
    render(<FirstAdminBootstrapCard status="disabled" />);

    expect(screen.getByText(/首次管理員設定目前未啟用/)).toBeInTheDocument();
    expect(screen.queryByLabelText("初始化權杖")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到 Google 登入" })).toHaveAttribute("href", "/login");
  });

  it("renders labelled email and token controls when enabled", () => {
    render(<FirstAdminBootstrapCard status="ready" />);

    expect(screen.getByLabelText("管理員 email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("初始化權杖")).toHaveAttribute("name", "token");
    expect(screen.getByRole("button", { name: "建立第一位管理員" })).toBeInTheDocument();
  });

  it("shows completed setup with admin and login links instead of the token form", () => {
    render(<FirstAdminBootstrapCard status="completed" />);

    expect(screen.getByText(/首次管理員設定已完成/)).toBeInTheDocument();
    expect(screen.getByText(/不必先移除 token 或重啟服務/)).toBeInTheDocument();
    expect(screen.queryByLabelText("初始化權杖")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("管理員 email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "建立第一位管理員" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "進入管理後台" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "回到 Google 登入" })).toHaveAttribute("href", "/login");
  });
});
