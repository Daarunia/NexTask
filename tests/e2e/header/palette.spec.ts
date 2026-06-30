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
