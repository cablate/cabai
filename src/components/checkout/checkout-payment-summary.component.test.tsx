import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Plan } from "@/lib/db/schema";
import { CheckoutPaymentSummary } from "./checkout-payment-summary";

const basePlan = {
  id: "plan-course",
  providerPlanId: "shared-provider-plan",
  slug: "course",
  name: "CabAI 真實課程",
  description: null,
  amount: 1_500,
  currency: "TWD",
  billingPeriod: "one-time",
  pricingType: "fixed",
  status: "active",
  image: null,
  merchantPlanId: null,
  hasPlatformContent: true,
  hasExternalService: false,
  gateway: "portaly",
  purchaseButtonMode: "internal",
  externalCheckoutUrl: null,
  externalCheckoutLabel: null,
  externalCheckoutNewTab: true,
  portalyCreatedAt: null,
  portalyUpdatedAt: null,
  syncedAt: new Date("2026-08-13T00:00:00.000Z"),
} satisfies Plan;

const buyer = {
  name: "測試使用者",
  email: "buyer@example.com",
  image: null,
};

describe("CheckoutPaymentSummary", () => {
  it("shows the CabAI product, exact amount, buyer and honest Portaly handoff", () => {
    render(
      <CheckoutPaymentSummary
        plan={basePlan}
        productName="AgentSkill — 讓 AI 成為你的協作者"
        buyer={buyer}
        providerMode="live"
      />,
    );

    expect(screen.getByRole("heading", { name: "付款摘要" })).toBeInTheDocument();
    expect(screen.getByText("AgentSkill — 讓 AI 成為你的協作者")).toBeInTheDocument();
    expect(screen.getByText("NT$1,500")).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText(/共用付款方案名稱/)).toBeInTheDocument();
    expect(screen.getByText(/下一頁金額不同/)).toBeInTheDocument();

    const form = screen.getByRole("button", { name: "前往 Portaly 安全付款 · NT$1,500" }).closest("form");
    expect(form).toHaveAttribute("method", "POST");
    expect(form).toHaveAttribute("action", "/api/checkout");
    expect(form?.querySelector('input[name="planId"]')).toHaveValue("plan-course");
  });

  it("makes test mode unmistakable", () => {
    render(
      <CheckoutPaymentSummary
        plan={basePlan}
        productName={basePlan.name}
        buyer={buyer}
        providerMode="test"
      />,
    );

    expect(screen.getByText("測試付款")).toBeInTheDocument();
    expect(screen.getByText(/請勿把此頁當成正式收款流程/)).toBeInTheDocument();
  });

  it("keeps disabled plans non-purchasable", () => {
    render(
      <CheckoutPaymentSummary
        plan={{ ...basePlan, purchaseButtonMode: "disabled" }}
        productName={basePlan.name}
        buyer={buyer}
        providerMode="live"
      />,
    );

    expect(screen.getByText("此方案目前無法購買")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /前往 Portaly/ })).not.toBeInTheDocument();
  });

  it("uses a labeled numeric field for dynamic pricing", () => {
    render(
      <CheckoutPaymentSummary
        plan={{ ...basePlan, pricingType: "dynamic" }}
        productName={basePlan.name}
        buyer={buyer}
        providerMode="live"
      />,
    );

    const amount = screen.getByRole("spinbutton", { name: "付款金額" });
    expect(amount).toHaveAttribute("min", "1");
    expect(amount).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByRole("button", { name: "前往 Portaly 安全付款" })).toBeInTheDocument();
  });
});
