import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppErrorState } from "./app-error-state";

describe("AppErrorState", () => {
  it("moves focus to the message and offers both recovery paths", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(
      <AppErrorState
        contextLabel="會員中心"
        title="這個會員頁面暫時打不開"
        description="先再試一次，或回到會員中心。"
        reset={reset}
        destinationHref="/dashboard"
        destinationLabel="回到會員中心"
        errorId="opaque-error-id"
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "這個會員頁面暫時打不開",
    });
    await waitFor(() => expect(heading).toHaveFocus());

    const retry = screen.getByRole("button", { name: "再試一次" });
    const destination = screen.getByRole("link", { name: "回到會員中心" });
    expect(retry).toHaveClass("min-h-11");
    expect(destination).toHaveClass("min-h-11");

    await user.click(retry);
    expect(reset).toHaveBeenCalledOnce();
    expect(destination).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByText("opaque-error-id")).toBeInTheDocument();
  });

  it("does not expose an empty error identifier", () => {
    render(
      <AppErrorState
        contextLabel="頁面載入遇到狀況"
        title="這個頁面剛剛出了點狀況"
        description="請再試一次。"
        reset={() => undefined}
        destinationHref="/"
        destinationLabel="回到首頁"
      />,
    );

    expect(screen.queryByText("錯誤識別碼：")).not.toBeInTheDocument();
  });
});
