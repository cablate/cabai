import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFirstAdminBootstrapStatus } from "@/lib/first-admin-bootstrap";
import FirstAdminSetupPage from "./page";

vi.mock("@/lib/first-admin-bootstrap", () => ({ getFirstAdminBootstrapStatus: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("FirstAdminSetupPage", () => {
  it.each(["completed", "disabled", "ready"] as const)("renders the database-backed %s state", async (status) => {
    vi.mocked(getFirstAdminBootstrapStatus).mockResolvedValue(status);

    render(await FirstAdminSetupPage());

    expect(getFirstAdminBootstrapStatus).toHaveBeenCalledWith();
    if (status === "completed") {
      expect(screen.getByText(/首次管理員設定已完成/)).toBeInTheDocument();
      expect(screen.queryByLabelText("初始化權杖")).not.toBeInTheDocument();
    } else if (status === "disabled") {
      expect(screen.getByText(/首次管理員設定目前未啟用/)).toBeInTheDocument();
      expect(screen.queryByLabelText("初始化權杖")).not.toBeInTheDocument();
    } else {
      expect(screen.getByLabelText("初始化權杖")).toBeInTheDocument();
    }
  });
});
