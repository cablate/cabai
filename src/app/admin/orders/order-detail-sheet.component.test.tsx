import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildOrderReconciliationText, OrderDetailSheet } from "./order-detail-sheet";
import type { OrderRow } from "./orders-table";

const order: OrderRow = {
  id: "local-order-1",
  merchantOrderNumber: "CAB-20260813-001",
  status: "completed",
  paidAmount: 1_500,
  expectedAmount: 1_500,
  currency: "TWD",
  expectedCurrency: "TWD",
  paymentMethod: "credit_card",
  providerPlanId: "provider-plan-shared",
  providerMode: "live",
  portalySessionId: "session-live-1",
  checkoutSessionExpiresAt: "2026-08-13T01:00:00.000Z",
  updatedAt: "2026-08-13T00:05:00.000Z",
  refundAmount: null,
  refundedAt: null,
  refundReason: null,
  subscriptionId: null,
  subscriptionStatus: null,
  hasActiveEntitlement: true,
  createdAt: "2026-08-13T00:00:00.000Z",
  planId: "local-plan-1",
  planName: "測試課程",
  userEmail: "buyer@example.com",
};

describe("OrderDetailSheet", () => {
  it("opens from the keyboard and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<OrderDetailSheet order={order} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "查看詳情" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows immutable payment evidence without exposing a refund mutation", async () => {
    render(<OrderDetailSheet order={order} />);

    await userEvent.click(screen.getByRole("button", { name: "查看詳情" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("測試課程");
    expect(screen.getByRole("dialog")).toHaveTextContent("正式環境");
    expect(screen.getByRole("dialog")).toHaveTextContent("provider-plan-shared");
    expect(screen.getByRole("dialog")).toHaveTextContent("session-live-1");
    expect(screen.queryByRole("button", { name: /退款/ })).not.toBeInTheDocument();
    expect(screen.getByText("退款仍由 Portaly 正式管道處理")).toBeInTheDocument();
  });

  it("copies only the minimum reconciliation identifiers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<OrderDetailSheet order={order} />);
    await userEvent.click(screen.getByRole("button", { name: "查看詳情" }));
    await userEvent.click(screen.getByRole("button", { name: "複製核對資料" }));

    const copied = buildOrderReconciliationText(order);
    expect(writeText).toHaveBeenCalledWith(copied);
    expect(copied).toContain("Portaly mode：live");
    expect(copied).toContain("Portaly session ID：session-live-1");
    expect(copied).not.toContain(order.userEmail!);
    expect(screen.getByRole("button", { name: "已複製" })).toBeInTheDocument();
  });

  it("does not infer a provider environment for historical orders", async () => {
    render(<OrderDetailSheet order={{ ...order, providerMode: null }} />);
    await userEvent.click(screen.getByRole("button", { name: "查看詳情" }));

    expect(screen.getByText("環境未知")).toBeInTheDocument();
    expect(screen.getAllByText("尚無證據").length).toBeGreaterThan(0);
  });
});
