import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("service fixture: subscription is disabled by default and uses synthetic settings when enabled", async ({ page }, testInfo) => {
  await page.route("https://f.convertkit.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  await page.route("https://app.kit.com/**", route => route.fulfill({ status: 200, body: "synthetic subscription response" }));

  const response = await page.goto("/subscribe?utm_source=threads&utm_medium=social");

  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("https://f.convertkit.com");
  expect(csp).toContain("https://app.kit.com");
  await expect(
    page.getByRole("heading", { level: 1, name: "留下 Email，收到後續更新" }),
  ).toBeVisible();
  if (!testInfo.project.metadata.servicesEnabled) {
    await expect(page.getByRole("status")).toContainText("此站尚未啟用 Email 訂閱");
    await expect(page.locator("form[data-entry='updates']")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0);
    await expect(page.locator('script[src*="convertkit"]')).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("button", { name: "訂閱更新" })).toBeVisible();

  const form = page.locator("form[data-entry='updates']");
  await expect(form).toHaveAttribute(
    "action",
    "https://app.kit.com/forms/12345/subscriptions",
  );
  await expect(form).toHaveAttribute("data-sv-form", "12345");
  await expect(form).toHaveAttribute("data-uid", "example_uid");
  const options = JSON.parse((await form.getAttribute("data-options")) ?? "{}");
  expect(options.settings.after_subscribe).toMatchObject({
    action: "message",
    success_message: "已完成訂閱，後續更新會寄到你的信箱。",
    redirect_url: "",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "訂閱更新" })).toBeInViewport();

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect(violations).toEqual([]);
});
