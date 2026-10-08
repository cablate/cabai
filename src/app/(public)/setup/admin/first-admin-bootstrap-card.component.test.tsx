import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstAdminBootstrapCard } from "./first-admin-bootstrap-card";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("FirstAdminBootstrapCard", () => {
  it("explains the disabled state without rendering a token form", () => {
    render(<FirstAdminBootstrapCard enabled={false} />);

    expect(screen.getByText(/首次管理員設定目前未啟用/)).toBeInTheDocument();
    expect(screen.queryByLabelText("初始化權杖")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到 Google 登入" })).toHaveAttribute("href", "/login");
  });

  it("renders labelled email and token controls when enabled", () => {
    render(<FirstAdminBootstrapCard enabled />);

    expect(screen.getByLabelText("管理員 email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("初始化權杖")).toHaveAttribute("name", "token");
    expect(screen.getByRole("button", { name: "建立第一位管理員" })).toBeInTheDocument();
  });
});
