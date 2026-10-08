import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KitEmailJoinForm } from "@/components/join/kit-email-join-form";

vi.mock("next/script", () => ({
  default: (props: React.ScriptHTMLAttributes<HTMLScriptElement>) => <script {...props} />,
}));

describe("KitEmailJoinForm", () => {
  it("submits the email to Kit and keeps the visitor on the page after success", () => {
    render(
      <KitEmailJoinForm
        formId="12345"
        formUid="updates-uid"
        entrySlug="updates"
        emailLabel="Email"
        emailPlaceholder="name@example.com"
        submitLabel="訂閱更新"
        consentText="送出即同意接收 CabAI Email，可隨時取消訂閱。"
        successMessage="已完成訂閱，後續更新會寄到你的信箱。"
      />,
    );

    const form = screen.getByRole("button", { name: "訂閱更新" }).closest("form");
    expect(form).toHaveAttribute("action", "https://app.kit.com/forms/12345/subscriptions");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("data-sv-form", "12345");
    expect(form).toHaveAttribute("data-uid", "updates-uid");
    expect(form).toHaveAttribute("data-entry", "updates");

    const options = JSON.parse(form!.getAttribute("data-options")!);
    expect(options.settings.after_subscribe).toMatchObject({
      action: "message",
      success_message: "已完成訂閱，後續更新會寄到你的信箱。",
      redirect_url: "",
    });

    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email_address");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Email")).toBeRequired();
  });
});
