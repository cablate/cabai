import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopySourceIdButton } from "./copy-source-id-button";

describe("CopySourceIdButton", () => {
  it("copies the secondary source identifier on demand", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CopySourceIdButton value="library-entry-123" />);
    await userEvent.click(screen.getByRole("button", { name: "複製來源 ID" }));

    expect(writeText).toHaveBeenCalledWith("library-entry-123");
    expect(screen.getByRole("button", { name: "來源 ID 已複製" })).toHaveTextContent("已複製");
  });
});
