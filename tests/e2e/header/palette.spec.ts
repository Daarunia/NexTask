import { test, expect } from '../../fixtures/test'
import type { Page } from '@playwright/test'

/**
 * Tests E2E du sélecteur de thème de couleur de l'en-tête : ouverture et
 * fermeture du panneau, puis application de la couleur d'accent et des gris
 * assortis au thème choisi.
 */

// Gris attendus par thème : valeur 500 des familles slate, zinc et stone
const SURFACE_500 = { slate: '#64748b', zinc: '#71717a', stone: '#78716c' }

/**
 * Couleur calculée d'une variable CSS de couleur, via un élément témoin
 * (résout `light-dark()` selon le mode courant).
 * @param page Page de l'application
 * @param variable Nom de la variable (ex. `--p-primary-color`)
 */
async function resolvedColor(page: Page, variable: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, variable)
}

/**
 * Valeur d'une variable CSS de la racine, références `var()` résolues.
 * @param page Page de l'application
 * @param variable Nom de la variable
 */
async function rootVariable(page: Page, variable: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), variable)
}

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

test('la palette propose 8 thèmes et coche le thème courant', async ({ header }) => {
  await header.openPalette()

  await expect(header.paletteSwatches).toHaveCount(8)
  await expect(header.paletteSwatches.and(header.page.locator('[aria-pressed="true"]'))).toHaveCount(1)

  await header.paletteSwatch('Sarcelle').click()
  await expect(header.paletteSwatch('Sarcelle')).toHaveAttribute('aria-pressed', 'true')
  await expect(header.paletteLabel).toHaveText('Sarcelle')
})

test("le thème choisi applique sa couleur d'accent au bouton principal", async ({ header, page }) => {
  await header.ensureLightTheme()
  await header.openPalette()

  for (const label of ['Orange', 'Indigo']) {
    const swatch = header.paletteSwatch(label)
    const expected = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)

    await swatch.click()

    // Pastille et couleur d'accent partagent la même nuance
    await expect.poll(() => resolvedColor(page, '--p-primary-color')).toBe(expected)
  }
})

test('le thème choisi applique ses gris assortis', async ({ header, page }) => {
  await header.openPalette()

  await header.paletteSwatch('Orange').click()
  await expect.poll(() => rootVariable(page, '--p-surface-500')).toBe(SURFACE_500.stone)

  await header.paletteSwatch('Sarcelle').click()
  await expect.poll(() => rootVariable(page, '--p-surface-500')).toBe(SURFACE_500.slate)

  await header.paletteSwatch('Violet').click()
  await expect.poll(() => rootVariable(page, '--p-surface-500')).toBe(SURFACE_500.zinc)
})
