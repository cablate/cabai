import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  it("supports arrow-key activation and exposes the selected tab", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="交付設定區段">
          <TabsTrigger value="overview">總覽</TabsTrigger>
          <TabsTrigger value="courses">課程</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">總覽內容</TabsContent>
        <TabsContent value="courses">課程內容</TabsContent>
      </Tabs>,
    );

    const overview = screen.getByRole("tab", { name: "總覽" });
    overview.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "課程" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("課程內容")).toBeVisible();
  });
});
