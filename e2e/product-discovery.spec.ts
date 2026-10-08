import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("anonymous visitors can choose a product starting point without redundant filters", async ({
  page,
}) => {
  await page.goto("/products");

  await expect(
    page.getByRole("heading", { level: 1, name: "找到適合你的課程與內容" }),
  ).toBeVisible();
  await expect(page.getByText("想先從免費內容開始？")).toBeVisible();
  await expect(page.getByRole("link", { name: /瀏覽免費資源/ })).toHaveAttribute(
    "href",
    "/library",
  );
  await expect(page.getByRole("link", { name: /查看免費 Skill/ })).toHaveAttribute(
    "href",
    "/skills",
  );

  const typeFilters = page.getByRole("group", { name: "內容形式" });
  if (await typeFilters.count()) {
    await expect(typeFilters).toBeVisible();
    await expect(typeFilters.getByRole("button", { name: /全部/ })).toBeVisible();
    await expect(typeFilters.getByRole("button", { name: /線上課程/ })).toBeVisible();
    await expect(typeFilters.getByRole("button", { name: /線上講座/ })).toHaveCount(0);
  } else {
    // The clean CI fixture intentionally has one offering type. In that state
    // the catalogue must not render a filter that cannot change the results.
    await expect(typeFilters).toHaveCount(0);
  }
  const visibleCards = page.locator("article:visible");
  await expect(visibleCards.getByText("免費", { exact: true }).first()).toBeVisible();
  await expect(visibleCards.getByText("查看內容", { exact: true }).first()).toBeVisible();

  if (process.env.CAPTURE_PR_F_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-f/products-desktop.png",
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("想先從免費內容開始？")).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect(violations).toEqual([]);

  if (process.env.CAPTURE_PR_F_EVIDENCE === "1") {
    await page.screenshot({
      path: "docs/audit/evidence/pr-f/products-mobile.png",
      fullPage: true,
    });
  }
});
