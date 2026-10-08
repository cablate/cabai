import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormErrorSummary, FormSaveStatus } from "./form-feedback";

describe("form feedback", () => {
  it("focuses a linked error summary", async () => {
    render(<><input id="name" /><FormErrorSummary feedback={{ fieldErrors: { name: ["名稱必填"] } }} fieldLabels={{ name: "方案名稱" }} /></>);
    const summary = screen.getByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByRole("link", { name: "方案名稱：名稱必填" })).toHaveAttribute("href", "#name");
  });

  it("renders save state with text", () => {
    render(<FormSaveStatus state="conflict" />);
    expect(screen.getByText("偵測到較新的版本")).toBeInTheDocument();
  });
});
