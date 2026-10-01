import { expect, test } from "playwright/test";

test("Homepage, Login und zentraler Grundfluss bleiben erreichbar", async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
      await route.continue();
    } else {
      externalRequests.push(url);
      await route.abort();
    }
  });

  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("link", { name: /anmelden/i }).first()).toBeVisible();

  await page.goto("/login");
  await expect(page.locator("#desk-login-submit")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await page.getByRole("link", { name: /registrieren/i }).first().click();
  await expect(page).toHaveURL(/\/registrieren$/);
  await expect(page.locator("#desk-register-form")).toBeVisible();

  await page.goto("/preise");
  await expect(page.locator("main")).toBeVisible();
  expect(externalRequests, "Der isolierte Gate darf keine externen Anfragen auslösen.").toEqual([]);
});
