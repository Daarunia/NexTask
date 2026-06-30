import { test, expect } from "../../fixtures/test";

/**
 * Test de la fermeture et de l'ouverture de la palette de couleur
 */
test("user can open and close color palette", async ({ header }) => {
  // Par défaut la palette est fermée
  await header.expectPaletteClosed();

  // Test d'ouverture
  await header.openPalette();
  await header.expectPaletteOpen();

  // Test de fermeture
  await header.closePaletteByOutsideClick();
  await header.expectPaletteClosed();
});

/**
 * Test du change de la couleur primaire via la palette de couleur
 */
test("user can change primary color", async ({ header, page }) => {
  await header.openPalette();

  // Récupération du premier bouton de couleur, et la couleur primaire associé
  const firstButton = header.palettePanel.locator("button").first();
  const bgColor = await firstButton.getAttribute("data-testcolor");

  // Changement de couleur primaire
  await firstButton.click();
  await header.closePaletteByOutsideClick();

  // Récupération de la couleur appliquée et comparaison entre la couleur du bouton utilisé dans la palette, et la couleur réellement utilisée
  const updatedRootColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--p-primary-color")
      .trim(),
  );
  expect(updatedRootColor).toBe(bgColor);
});
