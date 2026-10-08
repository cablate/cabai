import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("community onboarding is readable, actionable, and mobile-safe when signed out", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/community?utm_source=demo&utm_medium=example_site&utm_campaign=learning_catalog");

  await expect(page.getByRole("heading", { level: 1, name: "加入學習社群，一起討論 AI 實作" })).toBeVisible();
  await expect(page.getByText("討論課程裡沒解完的問題")).toBeVisible();
  await expect(page.getByText("分享作品、做法與實作進度")).toBeVisible();
  await expect(page.getByText("查看平台更新與活動資訊")).toBeVisible();
  const communityEyebrow = page.getByText("CabAI 學習社群", { exact: true });
  await expect(communityEyebrow).toHaveCSS("text-transform", "none");
  const join = page.getByRole("link", { name: /建立 CabAI 帳號並連結 Discord/ });
  await expect(join).toHaveAttribute(
    "href",
    "/login?callbackUrl=%2Fdashboard%2Fprofile%3Fcommunity%3D1",
  );
  await expect(page.getByRole("link", { name: "support@example.com" }).first()).toHaveAttribute(
    "href",
    /^mailto:support@example\.com/,
  );

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const mobileLayout = await page.evaluate(() => {
    const header = document.querySelector("header")?.getBoundingClientRect();
    const firstPageChild = document.querySelector("#main-content > *")?.getBoundingClientRect();
    return {
      headerHeight: header?.height ?? 0,
      firstPageChildTop: firstPageChild?.top ?? 0,
    };
  });
  expect(mobileLayout.headerHeight).toBeGreaterThanOrEqual(51);
  expect(mobileLayout.headerHeight).toBeLessThanOrEqual(53);
  expect(mobileLayout.firstPageChildTop).toBeGreaterThanOrEqual(55);

  const footer = page.locator("footer");
  await expect(footer.getByText("CabAI", { exact: true })).toBeVisible();
  await expect(footer).not.toContainText("CABAI");
  await expect(footer).not.toContainText("All rights reserved");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要內容" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "CabAI", exact: true })).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 720 });
  const desktopLayout = await page.evaluate(() => {
    const header = document.querySelector("header")?.getBoundingClientRect();
    const firstPageChild = document.querySelector("#main-content > *")?.getBoundingClientRect();
    return {
      headerHeight: header?.height ?? 0,
      firstPageChildTop: firstPageChild?.top ?? 0,
      hasHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(desktopLayout.headerHeight).toBeGreaterThanOrEqual(55);
  expect(desktopLayout.headerHeight).toBeLessThanOrEqual(57);
  expect(desktopLayout.firstPageChildTop).toBeGreaterThanOrEqual(63);
  expect(desktopLayout.hasHorizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious"),
  ).toEqual([]);
});

test("free demo product and preview use reader-safe acquisition language and semantics", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/products/demo-course");

  await expect(page).toHaveTitle("站台驗收範例課程 — CabAI");
  await expect(page.getByRole("heading", { level: 1, name: "站台驗收範例課程" })).toBeVisible();
  await expect(page.getByRole("link", { name: "免費加入課程" })).toBeVisible();
  await expect(page.getByText("單次購買", { exact: true })).toHaveCount(0);
  await expect(page.getByText("購買後永久觀看", { exact: true })).toHaveCount(0);
  await expect(page.locator("main main")).toHaveCount(0);

  const productOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(productOverflow).toBe(false);

  await page.goto(
    "/preview/00000000-0000-4000-8000-000000000100/00000000-0000-4000-8000-000000000301",
  );
  await expect(page).toHaveTitle("先確認課堂內容（免費試看） — CabAI");
  await expect(page.getByRole("heading", { level: 1, name: "先確認課堂內容" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "先確認三件事" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "免費加入《站台驗收範例課程》並繼續學習" })).toBeVisible();
  await expect(page.getByRole("link", { name: "回商品頁免費加入" })).toHaveCount(1);
  await expect(page.getByText("一次付款", { exact: true })).toHaveCount(0);
  await expect(page.getByText("解鎖完整課程", { exact: true })).toHaveCount(0);
  await expect(page.locator("main main")).toHaveCount(0);
});

test("service fixture: login is disabled without credentials; enabled login sanitizes callbacks", async ({ page }, testInfo) => {
  if (!testInfo.project.metadata.servicesEnabled) {
    const signinRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/auth/signin/")) signinRequests.push(request.url());
    });
    await page.goto("/login?callbackUrl=https%3A%2F%2Fexample.com%2Fsteal");
    await expect(page.getByRole("heading", { name: "會員登入尚未設定" })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用 Google 帳號登入" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "返回首頁" })).toHaveAttribute("href", "/");
    expect(signinRequests).toEqual([]);
    return;
  }
  let submittedCallbackUrl: string | null = null;
  await page.route("**/api/auth/**", async (route) => {
    if (!route.request().url().includes("/api/auth/signin/google")) {
      await route.continue();
      return;
    }
    const form = new URLSearchParams(route.request().postData() ?? "");
    submittedCallbackUrl = form.get("callbackUrl");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "about:blank" }),
    });
  });

  await page.goto("/login?callbackUrl=https%3A%2F%2Fexample.com%2Fsteal");
  await expect.poll(() => submittedCallbackUrl).toBe("/dashboard");
  submittedCallbackUrl = null;
  await page.goto("/login?callbackUrl=%2Fdashboard%2Fprofile");
  await expect.poll(() => submittedCallbackUrl).toBe("/dashboard/profile");
});
