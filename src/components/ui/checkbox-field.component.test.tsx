import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
  it("preserves native FormData submission behavior", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <CheckboxField name="isPreview" label="免費預覽" />
      </form>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "免費預覽" });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(new FormData(container.querySelector("form")!).get("isPreview")).toBe("on");
  });
});
