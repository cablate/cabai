import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLibraryAction: vi.fn(),
  updateLibraryAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/library/actions", () => ({
  createLibraryAction: mocks.createLibraryAction,
  updateLibraryAction: mocks.updateLibraryAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { LibraryEditorForm } from "./library-editor-form";

describe("LibraryEditorForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the existing Markdown renderer for a live preview", () => {
    render(<LibraryEditorForm />);

    fireEvent.change(screen.getByLabelText("Markdown 內容"), {
      target: { value: "# Preview title\n\n[Safe link](https://example.com)" },
    });

    expect(screen.getByRole("heading", { name: "Preview title", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Safe link" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("button", { name: "建立 Library 草稿" })).toBeInTheDocument();
  });

  it("preserves revision and native form controls when editing", () => {
    const { container } = render(<LibraryEditorForm entry={{
      id: "library-1",
      slug: "entry",
      title: "Entry",
      summary: "Summary",
      bodyMarkdown: "## Body",
      tags: ["one", "two"],
      featured: true,
      revision: 7,
      status: "draft",
    }} />);

    expect(container.querySelector('input[name="expectedRevision"]')).toHaveValue("7");
    expect(screen.getByRole("checkbox", { name: "設為精選內容" })).toBeChecked();
    expect(screen.getByRole("button", { name: "儲存草稿" })).toHaveAttribute("type", "submit");
  });

  it("keeps a published slug read-only while allowing content edits", () => {
    render(<LibraryEditorForm entry={{
      id: "library-1",
      slug: "published-entry",
      title: "Published entry",
      summary: "Summary",
      bodyMarkdown: "## Body",
      tags: ["guide"],
      featured: false,
      revision: 3,
      status: "published",
    }} />);

    expect(screen.getByLabelText("網址代稱")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "儲存變更" })).toHaveAttribute("type", "submit");
  });
});
