import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// This scenario creates the first administrator, which is intentionally a
// one-time operation. Retrying against the same database would test OAuth
// fallback instead of the failed step and hide the original failure.
test.describe.configure({ retries: 0 });

// This browser flow retains the bootstrapped administrator role throughout.
// It verifies the learner UI, not an ordinary member's entitlement boundary or OAuth.
test("admin bootstrap, learner UI, and authoring mainline (not member authorization)", async ({ page }) => {
  test.setTimeout(300_000);
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("hydrated but some attributes")) {
      hydrationWarnings.push(message.text());
    }
  });

  const token = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!token) throw new Error("ADMIN_BOOTSTRAP_TOKEN is required for the provider-free E2E fixture");

  await page.goto("/setup/admin");
  const appOrigin = new URL(page.url()).origin;
  await page.getByLabel("管理員 email").fill("test-e2e-admin@example.com");
  await page.getByRole("textbox", { name: "初始化權杖", exact: true }).fill(token);
  await page.getByRole("button", { name: "建立第一位管理員" }).click();
  await expect(page).toHaveURL(`${appOrigin}/admin`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  const adminNavigation = page.getByRole("navigation", { name: "管理後台" });
  await expect(page.getByRole("heading", { level: 1, name: "今日工作台" })).toBeVisible();
  await expect(adminNavigation.getByText("內容製作", { exact: true })).toBeVisible();
  await expect(adminNavigation.getByText("商務與權限", { exact: true })).toBeVisible();
  await expect(adminNavigation.getByText("成效與分發", { exact: true })).toBeVisible();
  await expect(adminNavigation.getByText("系統維運", { exact: true })).toBeVisible();
  await expect(adminNavigation.getByRole("link", { name: "介面元件" })).toHaveCount(0);
  if (process.env.CAPTURE_PR_H_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-h/admin-dashboard-desktop.png",
      fullPage: true,
    });
  }

  await page.goto("/admin/orders?view=local");
  await expect(page.getByRole("heading", { level: 1, name: "訂單與對帳" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "訂單資料來源" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "站內訂單" })).toBeVisible();

  await page.goto("/products/demo-course");
  await expect(page.getByText("你已加入此內容")).toBeVisible();
  await expect(page.getByRole("link", { name: "適合你嗎" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "保障" })).toHaveCount(0);
  await expect(page.getByText("價格", { exact: true })).toHaveCount(0);
  await expect(page.getByText("費用", { exact: true })).toHaveCount(0);

  const origin = new URL(page.url()).origin;
  const claim = await page.request.post("/api/checkout/free-claim", {
    form: { planId: "00000000-0000-4000-8000-000000000001" },
    headers: { Origin: origin, Referer: `${origin}/products/demo-course` },
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(claim.status());
  expect(claim.headers().location).toBe("/my/demo-course");

  await page.goto("/my/demo-course");
  await expect(page.getByRole("heading", { level: 1, name: "站台驗收範例課程" })).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/courses\/00000000-0000-4000-8000-000000000100$/),
    page.getByRole("link", { name: /站台驗收範例課程/ }).click(),
  ]);
  await expect(page).toHaveURL(/\/courses\/00000000-0000-4000-8000-000000000100$/);
  await expect(page.getByText("還有 3 堂")).toBeVisible();
  await expect(page.getByText("約 12 分鐘")).toBeVisible();
  await expect(page.getByRole("button", { name: /從這裡開始/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: /體驗學員流程/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  if (process.env.CAPTURE_PR_E_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-e/course-overview-desktop.png",
      fullPage: true,
    });
  }
  await Promise.all([
    page.waitForURL(/\/lessons\/00000000-0000-4000-8000-000000000301$/),
    page.getByRole("link", { name: /先確認課堂內容/ }).click(),
  ]);
  await expect(page).toHaveURL(/\/lessons\/00000000-0000-4000-8000-000000000301$/);
  await expect(page.getByRole("heading", { level: 1, name: "先確認課堂內容" })).toBeVisible();
  await expect(page.getByText("第 1 堂，共 3 堂")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "本堂閱讀進度" }),
  ).toBeVisible();
  await expect(page.getByText("本堂目錄")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "開啟章節目錄" })).toBeVisible();
  if (process.env.CAPTURE_PR_E_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-e/lesson-mobile.png",
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "完成這堂", exact: true }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /下一課/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
  expect(hydrationWarnings).toEqual([]);

  await page.setViewportSize({ width: 768, height: 900 });
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
    item.impact === "critical" || item.impact === "serious",
  )).toEqual([]);

  await page.goto("/admin/courses");
  await page.getByLabel("展開建立課程表單").click();
  await page.getByLabel("關聯方案").selectOption("00000000-0000-4000-8000-000000000001");
  await page.getByRole("textbox", { name: "課程名稱", exact: true }).fill("E2E Authoring Draft");
  await Promise.all([
    page.waitForURL(/\/admin\/courses\/[0-9a-f-]+$/),
    page.getByRole("button", { name: "建立課程" }).click(),
  ]);
  await expect(page).toHaveURL(/\/admin\/courses\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 2, name: /尚有 \d+ 個必要項目/ })).toBeVisible();
  await expect(page.getByText("至少需要 1 個章節")).toBeVisible();
  await expect(page.getByRole("button", { name: /發布課程/ })).toHaveCount(0);
  const authoredCourseUrl = page.url();

  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 2, name: "文章正在整理中" })).toBeVisible();

  await page.goto("/skills");
  await expect(page.getByRole("heading", { level: 1, name: "Skills" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "目前還沒有公開 Skill" })).toBeVisible();

  await page.goto("/admin/library/new");
  await page.getByLabel("標題").fill("E2E Library Draft");
  await page.getByLabel("網址代稱").fill("e2e-library-draft");
  await page.getByLabel("摘要").fill("A draft that must remain hidden from the public Library.");
  await page.getByLabel("Markdown 內容").fill("## Draft only\n\nThis content is not published.");
  await Promise.all([
    page.waitForURL(/\/admin\/library\/[0-9a-f-]+$/),
    page.getByRole("button", { name: "建立 Library 草稿" }).click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Library Draft" })).toBeVisible();

  await page.goto("/admin/library/home-classification");
  await expect(page.getByRole("heading", { level: 1, name: "首頁免費資源分類預覽" })).toBeVisible();
  await expect(page.getByRole("main").getByText("這一頁不會搬資料、發布內容或產生未讀 Information")).toBeVisible();

  await page.goto("/admin/skills/new");
  await page.getByLabel("名稱").fill("E2E Skill Draft");
  await page.getByLabel("Slug").fill("e2e-skill-draft");
  await page.getByLabel("摘要").fill("A versioned Skill draft for browser acceptance.");
  await Promise.all([
    page.waitForURL(/\/admin\/skills\/[0-9a-f-]+$/),
    page.getByRole("button", { name: "建立 Skill" }).click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Skill Draft" })).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 2, name: "待完成內容" })).toBeVisible();
  await expect(page.getByRole("link", { name: /課程草稿/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Library 草稿/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Skill 草稿/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("navigation").getByRole("link", { name: "資源庫" })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Skills" })).toHaveCount(0);

  await page.goto(authoredCourseUrl);

  await page.setViewportSize({ width: 360, height: 800 });
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
    item.impact === "critical" || item.impact === "serious",
  )).toEqual([]);

  await page.goto("/dashboard/profile?community=1&discord=not_configured");
  await expect(page.getByRole("heading", { level: 1, name: "下一步：連結 Discord" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Discord" })).toContainText("Discord 尚未開放");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "開啟管理選單" }).click();
  const mobileAdminNavigation = page.getByRole("navigation", { name: "管理後台" });
  await expect(mobileAdminNavigation.getByRole("link", { name: "今日工作台" })).toBeVisible();
  await expect(mobileAdminNavigation.getByRole("link", { name: "訂單與對帳" })).toBeVisible();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.CAPTURE_PR_H_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-h/admin-dashboard-mobile.png",
    });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
    item.impact === "critical" || item.impact === "serious",
  )).toEqual([]);
});
