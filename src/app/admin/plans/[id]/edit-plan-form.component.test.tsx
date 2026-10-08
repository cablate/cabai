import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/plans", () => ({
  updatePlan: vi.fn(async () => ({ success: true })),
}));

const { EditPlanForm } = await import("./edit-plan-form");

const manualPlan = {
  id: "local-plan-1",
  slug: "local-plan",
  name: "本地方案",
  description: "測試說明",
  amount: 1500,
  billingPeriod: "one-time",
  pricingType: "fixed",
  status: "active",
  providerPlanId: null,
};

describe("EditPlanForm gateway conversion", () => {
  it("reveals a required Provider Plan ID when converting a Manual plan", async () => {
    const user = userEvent.setup();
    render(<EditPlanForm plan={manualPlan} gateway="manual" />);

    expect(screen.getByRole("radio", { name: /維持 Manual/ })).toBeChecked();
    expect(screen.queryByLabelText("Portaly Provider Plan ID")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /轉換為 Portaly/ }));

    expect(screen.getByLabelText("Portaly Provider Plan ID")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "驗證並轉換為 Portaly" }),
    ).toBeEnabled();
  });

  it("keeps an existing Portaly plan on Portaly while allowing its provider mapping to be edited", () => {
    render(
      <EditPlanForm
        gateway="portaly"
        plan={{ ...manualPlan, providerPlanId: "provider-dynamic-1" }}
      />,
    );

    expect(screen.queryByRole("radio", { name: /維持 Manual/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Portaly Provider Plan ID（選填）")).toHaveValue(
      "provider-dynamic-1",
    );
    expect(screen.getByRole("button", { name: "儲存變更" })).toBeEnabled();
  });
});
