import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentInformationEvent,
  AgentInformationItem,
} from "@/lib/db/schema";
import type { InformationSourceBundle } from "@/lib/information-sources";
import { domainSuccess } from "@/lib/services/library-skill-information-domain";

vi.mock("@/components/admin/information/information-form", () => ({
  InformationDraftForm: () => <div>草稿表單</div>,
  InformationLifecycleForm: ({ kind }: { kind: string }) => (
    <div>{kind === "publish" ? "發布表單" : "撤回表單"}</div>
  ),
}));

vi.mock("@/components/ui/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { InformationDetailWorkspace } from "./information-detail-workspace";

function information(overrides: Partial<AgentInformationItem> = {}): AgentInformationItem {
  return {
    id: "information-1",
    dedupeKey: "library_entry:library-1:2:library.updated",
    sourceType: "library_entry",
    sourceId: "library-1",
    sourceVersion: "2",
    kind: "library.updated",
    title: "Agent API 使用指南",
    summary: "說明如何取得最新內容。",
    whyItMatters: "避免重複掃描。",
    bodyMarkdown: "# 完整說明",
    audience: "all_users",
    actions: [{
      rel: "library-entry",
      operationId: "getPublicLibraryEntry",
      credential: "none",
      parameters: { idOrSlug: "agent-guide" },
    }],
    tags: ["agent"],
    status: "published",
    revision: 2,
    publishedAt: new Date("2026-07-29T00:00:00.000Z"),
    expiresAt: null,
    withdrawnAt: null,
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    updatedAt: new Date("2026-07-29T00:00:00.000Z"),
    ...overrides,
  };
}

const source: InformationSourceBundle = {
  sourceType: "library_entry",
  sourceId: "library-1",
  sourceVersion: "2",
  title: "Agent API 使用指南",
  summary: "說明如何取得最新內容。",
  allowedKinds: ["library.published", "library.updated"],
  audience: "all_users",
  sourceStatus: "published",
  requiresBundlePublish: true,
  actionTemplates: [],
  issues: [],
};

const history: AgentInformationEvent[] = [{
  id: "event-1",
  informationId: "information-1",
  idempotencyKey: "publish-1",
  fromStatus: "draft",
  toStatus: "published",
  actorType: "agent",
  actorId: "publisher",
  revision: 2,
  createdAt: new Date("2026-07-29T00:00:00.000Z"),
}];

describe("InformationDetailWorkspace", () => {
  it("presents the four admin tasks, exact paths and separate version concepts in Traditional Chinese", () => {
    const current = information();
    const withdrawn = information({
      id: "information-old",
      sourceVersion: "1",
      status: "withdrawn",
      revision: 3,
      withdrawnAt: new Date("2026-07-28T00:00:00.000Z"),
    });

    const { container } = render(
      <InformationDetailWorkspace
        item={current}
        source={domainSuccess(source)}
        readiness={domainSuccess({ ready: true, issues: [] })}
        stats={domainSuccess({
          eligible: 8,
          read: 3,
          unread: 5,
          calculatedAt: new Date("2026-07-30T00:00:00.000Z"),
        })}
        history={{ ok: true, value: history }}
        siblings={{ ok: true, value: [current, withdrawn] }}
        destinations={{
          ok: true,
          value: [
            { label: "Library 管理頁", href: "/admin/library/library-1", kind: "admin" },
            { label: "Library 公開頁", href: "/library/agent-guide", kind: "public" },
          ],
        }}
        actionPaths={{
          resolved: [{
            rel: "library-entry",
            operationId: "getPublicLibraryEntry",
            method: "GET",
            path: "/api/agent/public/v1/library/agent-guide",
            credential: "none",
          }],
          unresolvedCount: 0,
        }}
        qualityHints={[]}
        currentPublished={[current]}
        otherItems={[withdrawn]}
        publishIdempotencyKey="publish-key"
        withdrawIdempotencyKey="withdraw-key"
        now={new Date("2026-07-30T00:00:00.000Z")}
      />,
    );

    expect(screen.getByRole("heading", { name: "內容" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "發布與 readiness" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "來源與存取路徑" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "版本歷史與統計" })).toBeInTheDocument();
    expect(screen.getByText("/information")).toBeInTheDocument();
    expect(screen.getByText("GET /api/agent/information/information-1")).toBeInTheDocument();
    expect(screen.getByText("GET /api/agent/user/v1/information/information-1")).toBeInTheDocument();
    expect(screen.getByText("GET /api/agent/public/v1/library/agent-guide")).toBeInTheDocument();
    expect(screen.getByText("目前查看")).toBeInTheDocument();
    expect(screen.getByText("sourceVersion: 1")).toBeInTheDocument();
    expect(container).toHaveTextContent("草稿 → 已發布");
    expect(screen.getByText("撤回表單")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[繚鈫�]/u);
  });

  it("keeps source failures visible and does not expose an edit form without a canonical bundle", () => {
    const draft = information({
      status: "draft",
      revision: 1,
      publishedAt: null,
    });

    render(
      <InformationDetailWorkspace
        item={draft}
        source={{ ok: false, kind: "not-found", message: "Library entry not found" }}
        readiness={domainSuccess({
          ready: false,
          issues: [{
            code: "stale_source",
            field: "source",
            severity: "error",
            message: "Library entry not found",
          }],
        })}
        stats={{ ok: false, kind: "prerequisite-unavailable", message: "Stats unavailable" }}
        history={{ ok: true, value: [] }}
        siblings={{ ok: true, value: [draft] }}
        destinations={{ ok: false, message: "Library entry not found" }}
        actionPaths={{ resolved: [], unresolvedCount: 1 }}
        qualityHints={[{
          code: "stale_source",
          title: "來源缺少或已變更",
          description: "目前無法解析來源。",
        }]}
        currentPublished={[]}
        otherItems={[]}
        publishIdempotencyKey="publish-key"
        withdrawIdempotencyKey="withdraw-key"
        now={new Date("2026-07-30T00:00:00.000Z")}
      />,
    );

    expect(screen.getByText("來源無法載入，草稿暫時不能編輯")).toBeInTheDocument();
    expect(screen.queryByText("草稿表單")).not.toBeInTheDocument();
    expect(screen.getByText("來源缺少或已變更")).toBeInTheDocument();
    expect(screen.getByText("請先處理 readiness 問題，發布操作才會開放。")).toBeInTheDocument();
  });
});
