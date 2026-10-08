import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  PublicSkillProjection,
  PublicSkillReleaseProjection,
} from "@/lib/services/skill-release-service";
import { CABAI_AGENT_BASE_URL } from "@/lib/agent/prompt-copy";
import { SkillDetail, SkillList } from "./skill-catalog";

function release(
  overrides: Partial<PublicSkillReleaseProjection> = {},
): PublicSkillReleaseProjection {
  return {
    id: "release-1",
    skillId: "skill-1",
    version: "1.0.0",
    checksumSha256: "a".repeat(64),
    compatibility: "Codex and Claude Code",
    contentMarkdown: "## How to use\n\nUse this Skill for a governed plan.",
    license: "MIT",
    changelogMarkdown: "Initial release",
    accessPolicy: "authenticated",
    status: "published",
    publishedAt: new Date("2026-07-17T00:00:00.000Z"),
    deprecatedAt: null,
    downloadRequiresAuthentication: true,
    downloadableForViewer: false,
    distribution: { mode: "hosted" },
    ...overrides,
  };
}

function skill(currentRelease = release()): PublicSkillProjection {
  return {
    id: "skill-1",
    slug: "sample-skill",
    title: "Sample Skill",
    summary: "A governed Skill release.",
    tags: ["agent"],
    bodyMarkdown: currentRelease.contentMarkdown,
    publishedAt: new Date("2026-07-17T00:00:00.000Z"),
    currentRelease,
    releases: [currentRelease],
  };
}

describe("public Skill catalog", () => {
  it("renders release content as Markdown on the detail page", () => {
    render(<SkillDetail skill={skill()} authenticated={true} />);

    expect(screen.getByRole("heading", { name: "Skill 內容" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to use" })).toBeInTheDocument();
    expect(screen.getByText("Use this Skill for a governed plan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製 Agent API 查詢" })).toBeInTheDocument();
  });

  it("uses GitHub as the canonical install source without exposing CabAI release links", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const githubRelease = release({
      version: undefined,
      checksumSha256: undefined,
      downloadableForViewer: false,
      distribution: {
        mode: "github",
        repositoryUrl: "https://github.com/cablate/example-skill",
        sourceVerifiedAt: new Date("2026-08-04T00:00:00.000Z"),
        sourceBrowseUrl: `https://github.com/cablate/example-skill/tree/${"a".repeat(40)}`,
        installGuideUrl: `https://github.com/cablate/example-skill/blob/${"a".repeat(40)}/install/AGENT-INSTALL.md`,
        sourceArchiveUrl: `https://github.com/cablate/example-skill/archive/${"a".repeat(40)}.zip`,
        releaseUrl: "https://github.com/cablate/example-skill/releases/tag/v1.0.0",
      },
    });
    render(<SkillDetail skill={skill(githubRelease)} authenticated />);

    expect(screen.getByRole("link", { name: "在 GitHub 查看完整內容" })).toHaveAttribute(
      "href",
      "https://github.com/cablate/example-skill",
    );
    expect(screen.getByRole("button", { name: "複製給 AI 安裝" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "複製給 AI 安裝" }));
    expect(writeText).toHaveBeenLastCalledWith(
      "請從 GitHub 安裝 Sample Skill：https://github.com/cablate/example-skill\n\n先閱讀 Repository 內的 install/AGENT-INSTALL.md，依照手冊完成安裝。安裝前確認目標位置，不要覆蓋無關檔案。",
    );

    await userEvent.click(screen.getByRole("button", { name: "複製 Agent API 查詢" }));
    expect(writeText).toHaveBeenLastCalledWith(
      `查詢 Sample Skill 的 CabAI 公開介紹與 GitHub 來源：\nGET ${CABAI_AGENT_BASE_URL}/api/agent/public/v1/skills/sample-skill\n\n需要完整 Skill 或安裝方式時，直接使用回應中的 currentRelease.distribution.repositoryUrl 前往 GitHub。`,
    );
    expect(screen.queryByRole("link", { name: "安裝手冊" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下載完整來源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub 發布紀錄" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下載 Skill 檔案" })).not.toBeInTheDocument();
    expect(screen.queryByText("a".repeat(64))).not.toBeInTheDocument();
    expect(screen.queryByText("v1.0.0")).not.toBeInTheDocument();
    expect(screen.queryByText("更新與檔案資訊")).not.toBeInTheDocument();
  });

  it("distinguishes an authenticated Skill from a Product", () => {
    render(<SkillList skills={[skill()]} />);

    expect(screen.getByRole("heading", { name: "Sample Skill" })).toBeInTheDocument();
    expect(screen.getByText("登入後下載")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "搜尋 Skills" })).not.toBeInTheDocument();
    expect(screen.queryByText(/購買|價格/)).not.toBeInTheDocument();
  });

  it("does not expose a download link when the viewer is anonymous", () => {
    render(<SkillDetail skill={skill()} authenticated={false} />);

    expect(screen.getByRole("link", { name: "登入後下載" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下載 Skill 檔案" })).not.toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.getByText("檔案資訊")).toBeInTheDocument();
    expect(screen.queryByText("版本歷程")).not.toBeInTheDocument();
  });

  it("shows only the current release instead of listing every historical version", () => {
    const current = release({ version: "1.0.1" });
    const previous = release({ id: "release-old", version: "1.0.0", changelogMarkdown: "Old release" });
    render(<SkillDetail skill={{ ...skill(current), releases: [current, previous] }} authenticated={true} />);

    expect(screen.getByText("目前可用")).toBeInTheDocument();
    expect(screen.queryByText("v1.0.1")).not.toBeInTheDocument();
    expect(screen.queryByText("舊版本")).not.toBeInTheDocument();
    expect(screen.queryByText("v1.0.0")).not.toBeInTheDocument();
  });

  it("labels deprecated releases and permits a verified viewer download path", () => {
    const deprecated = release({
      status: "deprecated",
      deprecatedAt: new Date("2026-07-18T00:00:00.000Z"),
      downloadableForViewer: true,
    });
    render(<SkillDetail skill={skill(deprecated)} authenticated />);

    expect(screen.getByText("目前版本已棄用")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下載 Skill 檔案" })).toHaveAttribute(
      "href",
      "/skills/sample-skill/releases/1.0.0/download",
    );
  });
});
