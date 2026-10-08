import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginCard } from "./login-card";
const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn }));
beforeEach(() => { signIn.mockReset(); });
describe("login availability", () => {
  it("does not initiate OAuth or offer a broken button when disabled", () => {
    render(<LoginCard callbackUrl="/dashboard" googleEnabled={false} />);
    expect(screen.getByRole("heading", { name: "會員登入尚未設定" })).toBeVisible();
    expect(screen.getByRole("link", { name: "返回首頁" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });
  it("retains automatic Google sign-in when configured", async () => {
    signIn.mockResolvedValue(undefined);
    render(<LoginCard callbackUrl="/courses/example" googleEnabled />);
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/courses/example" }));
    expect(screen.getByText("正在前往 Google 登入…")).toBeVisible();
  });
  it("shows a manual fallback after a configured sign-in error", async () => {
    signIn.mockRejectedValue(new Error("synthetic network failure"));
    render(<LoginCard callbackUrl="/dashboard" googleEnabled />);
    await waitFor(() => expect(screen.getByRole("button", { name: /使用 Google 帳號登入/ })).toBeVisible());
  });
});
