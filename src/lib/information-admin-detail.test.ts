import { describe, expect, it } from "vitest";
import type { AgentInformationItem } from "@/lib/db/schema";
import type { InformationSourceBundle } from "@/lib/information-sources";
import {
  buildInformationQualityHints,
  groupInformationVersions,
  resolveInformationActionPath,
  resolveInformationActionPaths,
} from "@/lib/information-admin-detail";
import {
  domainFailure,
  domainSuccess,
  type ReadinessIssue,
} from "@/lib/services/library-skill-information-domain";

function item(overrides: Partial<AgentInformationItem> = {}): AgentInformationItem {
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
    bodyMarkdown: "# 使用方式",
    audience: "all_users",
    actions: [{
      rel: "library-entry",
      operationId: "getPublicLibraryEntry",
      credential: "none",
      parameters: { idOrSlug: "agent-guide" },
    }],
    tags: ["agent"],
    status: "draft",
    revision: 1,
    publishedAt: null,
    expiresAt: null,
    withdrawnAt: null,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    ...overrides,
  };
}

const sourceBundle: InformationSourceBundle = {
  sourceType: "library_entry",
  sourceId: "library-1",
  sourceVersion: "2",
  title: "Agent API 使用指南",
  summary: "說明如何取得最新內容。",
  allowedKinds: ["library.published", "library.updated"],
  audience: "all_users",
  sourceStatus: "draft",
  requiresBundlePublish: true,
  actionTemplates: [{
    rel: "library-entry",
    operationId: "getPublicLibraryEntry",
    credential: "none",
    parameters: { idOrSlug: "agent-guide" },
  }],
  issues: [],
};

describe("Information admin detail projection", () => {
  it("expands a canonical action to an exact path instead of leaving placeholders", () => {
    const action = item().actions[0]!;
    expect(resolveInformationActionPath(action)).toEqual({
      rel: "library-entry",
      operationId: "getPublicLibraryEntry",
      method: "GET",
      path: "/api/agent/public/v1/library/agent-guide",
      credential: "none",
    });
  });

  it("refuses to guess a path when the operation or parameters no longer match", () => {
    const invalid = {
      ...item().actions[0]!,
      operationId: "removedOperation",
    };
    expect(resolveInformationActionPath(invalid)).toBeNull();
    expect(resolveInformationActionPaths([invalid])).toEqual({
      resolved: [],
      unresolved: [invalid],
    });
  });

  it("derives non-mutating quality hints from stored content and canonical evidence", () => {
    const current = item({
      bodyMarkdown: "這段文字含有 � 與錯誤解碼內容",
    });
    const duplicate = item({ id: "information-2", status: "withdrawn" });
    const readinessIssues: ReadinessIssue[] = [{
      code: "broken_action",
      field: "actions.0",
      severity: "error",
      message: "Action is unavailable",
    }];

    const hints = buildInformationQualityHints({
      item: current,
      siblings: [current, duplicate],
      source: domainFailure("not-found", "Library entry not found"),
      readinessIssues,
      unresolvedActions: current.actions,
    });

    expect(hints.map((hint) => hint.code)).toEqual([
      "possible_mojibake",
      "duplicate_information",
      "stale_source",
      "broken_action",
    ]);
    expect(hints.find((hint) => hint.code === "possible_mojibake")?.fields)
      .toEqual(["bodyMarkdown"]);
    expect(hints.find((hint) => hint.code === "duplicate_information")?.relatedInformationIds)
      .toEqual(["information-2"]);
    expect(current.bodyMarkdown).toContain("�");
  });

  it("does not claim editorial review when canonical evidence has no obvious issue", () => {
    expect(buildInformationQualityHints({
      item: item(),
      siblings: [item()],
      source: domainSuccess(sourceBundle),
      readinessIssues: [],
      unresolvedActions: [],
    })).toEqual([]);
  });

  it("separates active published items from drafts and withdrawn history", () => {
    const current = item({ id: "draft", status: "draft" });
    const published = item({
      id: "published",
      status: "published",
      publishedAt: new Date("2026-07-29T00:00:00.000Z"),
    });
    const expired = item({
      id: "expired",
      status: "published",
      publishedAt: new Date("2026-07-28T00:00:00.000Z"),
      expiresAt: new Date("2026-07-29T00:00:00.000Z"),
    });
    const withdrawn = item({
      id: "withdrawn",
      status: "withdrawn",
      publishedAt: new Date("2026-07-27T00:00:00.000Z"),
      withdrawnAt: new Date("2026-07-28T00:00:00.000Z"),
    });

    const result = groupInformationVersions(
      current,
      [current, published, expired, withdrawn],
      new Date("2026-07-30T00:00:00.000Z"),
    );

    expect(result.currentPublished.map((candidate) => candidate.id)).toEqual(["published"]);
    expect(result.otherItems.map((candidate) => candidate.id)).toEqual(["expired", "withdrawn"]);
  });
});
