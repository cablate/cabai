import { describe, expect, it } from "vitest";
import { inspectLibraryFields, inspectLibraryMarkdown } from "./library-markdown";

describe("Library Markdown reject-invalid contract", () => {
  it("allows https and the supported relative link forms without network access", () => {
    const markdown = [
      "[PDF](https://example.com/a.pdf)",
      "[skill](/skills/x)",
      "[same](./same)",
      "[parent](../parent)",
      "[fragment](#part)",
      "[query](?page=2)",
    ].join("\n");

    expect(inspectLibraryMarkdown(markdown)).toEqual([]);
  });

  it("does not mistake code examples for executable HTML, links, or images", () => {
    const markdown = [
      "```html",
      "<script src=\"http://example.com/x.js\"></script>",
      "![not-an-image](javascript:alert(1))",
      "```",
      "`<div>[x](http://example.com)</div>`",
    ].join("\n");
    expect(inspectLibraryMarkdown(markdown)).toEqual([]);
  });

  it.each([
    ["raw HTML", "<script>alert(1)</script>", "unsafe_markdown_html"],
    ["Markdown image", "![alt](https://example.com/image.png)", "unsafe_markdown_image"],
    ["http", "[x](http://example.com)", "unsafe_link_protocol"],
    ["javascript", "[x](javascript:alert(1))", "unsafe_link_protocol"],
    ["data", "[x](data:text/plain,x)", "unsafe_link_protocol"],
    ["file", "[x](file:///tmp/x)", "unsafe_link_protocol"],
    ["mailto", "[x](mailto:a@example.com)", "unsafe_link_protocol"],
    ["protocol relative", "[x](//example.com/x)", "unsafe_link_protocol"],
    ["credential URL", "[x](https://user:pass@example.com/x)", "unsafe_link_protocol"],
    ["email autolink", "<a@example.com>", "unsafe_link_protocol"],
    ["uppercase multiline HTML", "<SCRIPT\ntype=\"text/javascript\">x</SCRIPT>", "unsafe_markdown_html"],
  ])("rejects %s", (_label, markdown, code) => {
    expect(inspectLibraryMarkdown(markdown).some((item) => item.code === code)).toBe(true);
  });

  it("reports required, length, slug, tag, control character, and possible-secret issues with the stable shape", () => {
    const issues = inspectLibraryFields({
      slug: "Bad Slug",
      title: "",
      summary: "summary",
      bodyMarkdown: "token = abcdefghijklmnopqrstuvwxyz\u0000",
      tags: ["duplicate", "duplicate", ""],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "required", field: "title", severity: "error" }),
      expect.objectContaining({ code: "invalid_format", field: "slug", severity: "error" }),
      expect.objectContaining({ code: "invalid_format", field: "tags", severity: "error" }),
      expect.objectContaining({ code: "possible_secret", field: "bodyMarkdown", severity: "error" }),
      expect.objectContaining({ code: "invalid_format", field: "bodyMarkdown", severity: "error" }),
    ]));
  });
});
