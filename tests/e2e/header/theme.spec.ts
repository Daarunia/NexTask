import { test, expect } from "../../fixtures/test";

/**
 * Test du changement de thème
 */
test("user can switch application theme", async ({ page, header }) => {
  const html = page.locator("html");

  // État initial
  await expect(html).not.toHaveClass(/app-dark/);

  // Passage en dark
  await header.themeButton.click();
  await expect(html).toHaveClass(/app-dark/);

  // Retour en light
  await header.themeButton.click();
  await expect(html).not.toHaveClass(/app-dark/);
});
