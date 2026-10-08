import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/app/admin/information/actions", () => ({
  createInformationAction: vi.fn(async () => null),
  updateInformationAction: vi.fn(async () => null),
  publishInformationAction: vi.fn(async () => null),
  withdrawInformationAction: vi.fn(async () => null),
}));

import {
  InformationDraftForm,
  InformationLifecycleForm,
} from "./information-form";

const bundle = {
  sourceType: "manual_announcement" as const,
  sourceId: "announcement-1",
  title: "系統維護公告",
  summary: "預計短暫維護。",
  allowedKinds: ["manual.announcement"],
  requiresAction: false,
  actionTemplates: [],
};

const draft = {
  id: "information-1",
  revision: 1,
  kind: "manual.announcement",
  title: "系統維護公告",
  summary: "預計短暫維護。",
  whyItMatters: "服務可能短暫中斷。",
  bodyMarkdown: "# 維護說明",
  tags: ["maintenance"],
  expiresAt: "",
  actions: [],
};

describe("Information admin forms", () => {
  it("uses Traditional Chinese task language for draft authoring", () => {
    const { container } = render(<InformationDraftForm bundle={bundle} draft={draft} />);

    expect(screen.getByLabelText("Information 種類")).toBeDisabled();
    expect(screen.getByLabelText("標題")).toHaveValue("系統維護公告");
    expect(screen.getByLabelText("摘要")).toHaveValue("預計短暫維護。");
    expect(screen.getByLabelText("為什麼重要")).toBeInTheDocument();
    expect(screen.getByLabelText("完整內文（Markdown）")).toBeInTheDocument();
    expect(screen.getByLabelText("標籤")).toBeInTheDocument();
    expect(screen.getByLabelText("到期時間")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "儲存草稿" })).toBeInTheDocument();
    expect(screen.getByText("此公告不需要 action。")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Save draft|Why it matters|Full content|繚|鈫|�/u);
  });

  it("uses explicit Traditional Chinese confirmation for lifecycle actions", () => {
    const { rerender } = render(
      <InformationLifecycleForm
        kind="publish"
        id="information-1"
        revision={1}
        idempotencyKey="publish-key"
      />,
    );

    expect(screen.getByLabelText("我已確認內容與 readiness，現在發布這筆 Information。"))
      .toBeRequired();
    expect(screen.getByRole("button", { name: "發布 Information" })).toBeInTheDocument();

    rerender(
      <InformationLifecycleForm
        kind="withdraw"
        id="information-1"
        revision={2}
        idempotencyKey="withdraw-key"
      />,
    );

    expect(screen.getByLabelText("我已確認要撤回這筆 Information。")).toBeRequired();
    expect(screen.getByRole("button", { name: "撤回 Information" })).toBeInTheDocument();
  });
});
