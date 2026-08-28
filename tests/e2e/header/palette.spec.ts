import { test, expect } from '../../fixtures/test'

/**
 * Test de la fermeture et de l'ouverture de la palette de couleur
 */
test('user can open and close color palette', async ({ header }) => {
  // Par défaut la palette est fermée
  await header.expectPaletteClosed()

  // Test d'ouverture
  await header.openPalette()
  await header.expectPaletteOpen()

  // Test de fermeture
  await header.closePaletteByOutsideClick()
  await header.expectPaletteClosed()
})

/**
 * Test du change de la couleur primaire via la palette de couleur
 */
test('user can change primary color', async ({ header, page }) => {
  // On force le thème clair : dans ce mode, PrimeVue mappe `--p-primary-color`
  // sur la nuance 500, qui est justement celle exposée par `data-testcolor`.
  await header.ensureLightTheme()

  await header.openPalette()

  // Récupération du premier bouton de couleur, et la couleur primaire associé
  const firstButton = header.palettePanel.locator('button').first()
  const bgColor = await firstButton.getAttribute('data-testcolor')

  // Changement de couleur primaire
  await firstButton.click()
  await header.closePaletteByOutsideClick()

  // Récupération de la couleur appliquée et comparaison entre la couleur du bouton utilisé dans la palette, et la couleur réellement utilisée
  const rawRootColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--p-primary-color').trim(),
  )
  // PrimeVue expose désormais --p-primary-color via light-dark(clair, sombre) :
  // getComputedStyle renvoie la valeur spécifiée brute (non résolue) pour une custom property,
  // on extrait donc manuellement la valeur "clair" puisque le thème clair est forcé ci-dessus.
  const lightDarkMatch = rawRootColor.match(/^light-dark\(\s*([^,]+)\s*,/)
  const updatedRootColor = lightDarkMatch ? lightDarkMatch[1].trim() : rawRootColor
  expect(updatedRootColor).toBe(bgColor)
})
