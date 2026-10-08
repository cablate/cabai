import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommonSalesSections } from "./common-sales-sections";

const metadata = {
  audienceItems: ["正在建立第一套 Agent 工作流程"],
  painPoints: ["資訊散落在不同工具"],
  notForItems: ["只想複製現成答案"],
  learningObjectives: ["建立可重複使用的流程"],
  includedItems: ["完整課程"],
  outcomes: ["能獨立規劃工作流"],
  prerequisites: ["具備基本 AI 工具經驗"],
  firstWeekPlan: "先完成環境設定",
  vsFreeContent: "提供完整脈絡與實作順序",
  instructor: { name: "CabAI 講師", bio: "協助學員建立 AI 工作流程。" },
  testimonials: [{ quote: "內容很實用", name: "學員 A" }],
  faqItems: [{ q: "可以重複觀看嗎？", a: "可以。" }],
};

describe("CommonSalesSections", () => {
  it("只在 fit 階段呈現適合度判斷資訊", () => {
    render(<CommonSalesSections metadata={metadata} phase="fit" />);

    expect(screen.getByText("這適合誰")).toBeInTheDocument();
    expect(screen.getByText("你是不是也卡在這裡？")).toBeInTheDocument();
    expect(screen.getByText("這可能不適合你")).toBeInTheDocument();
    expect(screen.queryByText("你會學到")).not.toBeInTheDocument();
    expect(screen.queryByText("購買前常見問題")).not.toBeInTheDocument();
  });

  it("只在 value 階段呈現內容與成果", () => {
    render(<CommonSalesSections metadata={metadata} phase="value" />);

    expect(screen.getByText("你會學到")).toBeInTheDocument();
    expect(screen.getByText("包含內容")).toBeInTheDocument();
    expect(screen.getByText("完成後你可以")).toBeInTheDocument();
    expect(screen.queryByText("這適合誰")).not.toBeInTheDocument();
    expect(screen.queryByText("購買前常見問題")).not.toBeInTheDocument();
  });

  it("只在 proof 階段呈現作者、評價與 FAQ", () => {
    render(<CommonSalesSections metadata={metadata} phase="proof" />);

    expect(screen.getByText("關於作者")).toBeInTheDocument();
    expect(screen.getByText("學員評價")).toBeInTheDocument();
    expect(screen.getByText("購買前常見問題")).toBeInTheDocument();
    expect(screen.queryByText("這適合誰")).not.toBeInTheDocument();
    expect(screen.queryByText("你會學到")).not.toBeInTheDocument();
  });
});
