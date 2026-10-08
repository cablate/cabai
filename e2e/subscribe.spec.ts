import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("anonymous visitors can join the CabAI mailing list", async ({ page }) => {
  await page.route("https://f.convertkit.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });

  const response = await page.goto("/subscribe?utm_source=threads&utm_medium=social");

  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("https://f.convertkit.com");
  expect(csp).toContain("https://app.kit.com");
  await expect(
    page.getByRole("heading", { level: 1, name: "留下 Email，收到後續更新" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "訂閱更新" })).toBeVisible();

  const form = page.locator("form[data-entry='updates']");
  await expect(form).toHaveAttribute(
    "action",
    "https://app.kit.com/forms/8921948/subscriptions",
  );
  await expect(form).toHaveAttribute("data-sv-form", "8921948");
  await expect(form).toHaveAttribute("data-uid", "2fbc45ae53");
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
