import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichEditor } from "./rich-editor";

describe("RichEditor fixed content boundary (actual Novel/Tiptap)", () => {
  it.each([
    '<img src="invalid" onerror="window.syntheticCanary=1">',
    '{"__proto__":{"onerror":"window.syntheticCanary=1","src":"invalid"}}',
  ])("keeps persisted content as text rather than imported attributes: %s", async (content) => {
    const { container } = render(<RichEditor initialContent={content} />);
    await waitFor(() => {
      expect(container.querySelector(".tiptap")?.textContent).toBe(content);
    });
    expect(container.querySelector(".tiptap img")).toBeNull();
    expect(container.querySelector(".tiptap [onerror], .tiptap [onclick]")).toBeNull();
  });

  it("does not preserve event attributes when HTML is pasted through the fixed schema", async () => {
    const { container } = render(<RichEditor initialContent="Existing text" />);
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    const editor = container.querySelector(".tiptap")!;
    fireEvent.paste(editor, {
      clipboardData: {
        types: ["text/html", "text/plain"],
        files: [],
        getData: (type: string) => type === "text/html"
          ? '<p onclick="window.syntheticCanary=1">Pasted safe text</p><img src="invalid" onerror="window.syntheticCanary=1">'
          : type === "text/plain" ? "Pasted safe text" : "",
      },
    });
    await waitFor(() => expect(editor.textContent).toContain("Pasted safe text"));
    expect(editor.querySelector("img, [onclick], [onerror]")).toBeNull();
  });
});
