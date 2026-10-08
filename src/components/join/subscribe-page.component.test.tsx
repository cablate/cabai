import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubscribePage } from "@/components/join/subscribe-page";
import { getSubscribePage } from "@/lib/subscribe-page";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("next/script", () => ({
  default: (props: React.ScriptHTMLAttributes<HTMLScriptElement>) => <script {...props} />,
}));

describe("SubscribePage", () => {
  it("passes the general-updates configuration to the Kit form", () => {
    render(<SubscribePage page={getSubscribePage({ KIT_GENERAL_UPDATES_FORM_ID: "12345", KIT_GENERAL_UPDATES_FORM_UID: "example_uid" })} />);

    const form = screen.getByRole("button", { name: "訂閱更新" }).closest("form");
    expect(form).toHaveAttribute(
      "action",
      "https://app.kit.com/forms/12345/subscriptions",
    );
    expect(form).toHaveAttribute("data-sv-form", "12345");
    expect(form).toHaveAttribute("data-uid", "example_uid");
  });
  it.each([{}, { KIT_GENERAL_UPDATES_FORM_ID: "12345" }, { KIT_GENERAL_UPDATES_FORM_UID: "example_uid" }])("does not render a form or Kit script with incomplete config %j", (environment) => {
    const { container } = render(<SubscribePage page={getSubscribePage(environment)} />);
    expect(screen.getByRole("status")).toHaveTextContent("尚未啟用");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

});
