import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppError from "./error";
import GlobalError from "./global-error";
import ProtectedError from "./(protected)/error";
import AdminError from "./admin/error";

const error = Object.assign(new Error("test render failure"), {
  digest: "opaque-test-digest",
});

describe("application error boundaries", () => {
  it("renders a complete Traditional Chinese document for a root layout failure", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={error} reset={vi.fn()} />,
    );

    expect(markup).toContain('<html lang="zh-TW">');
    expect(markup).toContain("CabAI 剛剛沒載入成功");
    expect(markup).toContain("opaque-test-digest");
  });

  it("uses a dynamic full viewport for a public page failure", () => {
    render(<AppError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "這個頁面剛剛出了點狀況" }).closest("section"))
      .toHaveClass("[min-block-size:100dvb]");
  });

  it("reserves the fixed site header height in the member area", () => {
    render(<ProtectedError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "這個會員頁面暫時打不開" }).closest("section"))
      .toHaveClass("[min-block-size:calc(100dvb-var(--site-header-height))]");
    expect(screen.getByRole("link", { name: "回到會員中心" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("reserves the mobile admin header and desktop content padding", () => {
    render(<AdminError error={error} reset={vi.fn()} />);

    const section = screen.getByRole("heading", { name: "後台這個頁面暫時打不開" })
      .closest("section");
    expect(section).toHaveClass("[min-block-size:calc(100dvb-4.5rem)]");
    expect(section).toHaveClass("md:[min-block-size:calc(100dvb-4rem)]");
  });
});
