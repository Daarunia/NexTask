import { test, expect } from "../../fixtures/test";

/**
 * Test du changement de thème
 */
test("user can switch application theme", async ({ page, header }) => {
  const html = page.locator("html");

  const initialClass = await html.getAttribute("class");
  const wasDark = initialClass?.includes("app-dark") ?? false;

  await header.themeButton.click();

  if (wasDark) {
    await expect(html).not.toHaveClass(/app-dark/);
  } else {
    await expect(html).toHaveClass(/app-dark/);
  }
});
