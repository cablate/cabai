import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlanPresentation } from "@/lib/db/schema";
import type { DeliveryOverview } from "@/lib/delivery";
import { CheckoutDeliveryExpectation } from "./checkout-delivery-expectation";

const presentation = {
  offeringType: "course",
} as PlanPresentation;

const delivery: DeliveryOverview = {
  planId: "plan-course",
  planSlug: "course",
  courses: [
    {
      id: "course-1",
      planId: "plan-course",
      title: "AgentSkill 正式課程",
      description: null,
      image: null,
      lessonCount: 9,
      completedLessonCount: 0,
    },
  ],
  contents: [
    {
      id: "content-1",
      planId: "plan-course",
      title: "課程補充手冊",
      type: "pdf",
      sortOrder: 0,
    },
  ],
  services: [
    {
      id: "service-1",
      planId: "plan-course",
      serviceName: "學員社群",
      isActive: true,
    },
  ],
  courseCount: 1,
  lessonCount: 9,
  completedLessonCount: 0,
  contentCount: 1,
  serviceCount: 1,
  activeServiceCount: 1,
  hasDelivery: true,
  primaryAction: {
    kind: "course",
    href: "/my/course",
    label: "開始學習",
    note: "1 門課程、9 堂課",
  },
};

describe("CheckoutDeliveryExpectation", () => {
  it("shows concrete delivery records instead of only a generic offering message", () => {
    render(<CheckoutDeliveryExpectation presentation={presentation} delivery={delivery} />);

    expect(screen.getByRole("heading", { name: "付款後會開通什麼" })).toBeInTheDocument();
    expect(screen.getByText("AgentSkill 正式課程")).toBeInTheDocument();
    expect(screen.getByText("9 堂課")).toBeInTheDocument();
    expect(screen.getByText("1 個檔案或站內內容")).toBeInTheDocument();
    expect(screen.getByText("課程補充手冊")).toBeInTheDocument();
    expect(screen.getByText("1 個服務項目")).toBeInTheDocument();
    expect(screen.getByText("學員社群")).toBeInTheDocument();
  });

  it("is honest when no separate delivery record can be listed", () => {
    render(
      <CheckoutDeliveryExpectation
        presentation={presentation}
        delivery={{
          ...delivery,
          courses: [],
          contents: [],
          services: [],
          courseCount: 0,
          lessonCount: 0,
          contentCount: 0,
          serviceCount: 0,
          activeServiceCount: 0,
          hasDelivery: false,
        }}
      />,
    );

    expect(screen.getByText(/沒有可另外列出的站內交付項目/)).toBeInTheDocument();
    expect(screen.getByText(/返回商品頁查看完整說明/)).toBeInTheDocument();
  });
});
