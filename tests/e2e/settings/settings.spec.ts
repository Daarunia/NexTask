import { test, expect } from '../../fixtures/test'
import type { ElectronApplication } from 'playwright'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la page Paramètres : navigation depuis l'en-tête, synchronisation
 * des réglages avec l'en-tête, persistance et remise à zéro entre deux tests.
 */

/** Facteur de zoom de la fenêtre principale, lu côté main. */
async function zoomFactor(electronApp: ElectronApplication): Promise<number> {
  return electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
}

test.describe('Page Paramètres', () => {
  test("s'ouvre depuis l'en-tête et ramène au tableau", async ({ page, header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.expectVisible()
    await expect(header.settingsButton).toHaveCount(0)
    await expect(settingsPage.appearanceSection).toBeVisible()

    await header.goHome()

    await settingsPage.expectHidden()
    await expect(header.homeButton).toHaveCount(0)
    await expect(page.getByTestId('stage-column').first()).toBeVisible()
  })

  test("masque les raccourcis d'apparence de l'en-tête, en doublon de la page", async ({ header }) => {
    await expect(header.themeButton).toBeVisible()
    await expect(header.paletteButton).toBeVisible()

    await header.goSettings()

    await expect(header.themeButton).toHaveCount(0)
    await expect(header.paletteButton).toHaveCount(0)

    await header.goHome()

    await expect(header.themeButton).toBeVisible()
    await expect(header.paletteButton).toBeVisible()
  })

  test("le mode choisi dans la page s'applique et se retrouve dans l'en-tête", async ({ header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.chooseMode('Clair')
    await header.expectDarkModeDisabled()

    await header.goHome()
    await expect(header.themeButton.locator('.pi-moon')).toBeVisible()

    await header.goSettings()
    await settingsPage.chooseMode('Sombre')
    await header.expectDarkModeEnabled()

    await header.goHome()
    await expect(header.themeButton.locator('.pi-sun')).toBeVisible()
  })

  test("le bouton de l'en-tête met à jour le mode affiché dans la page", async ({ header, settingsPage }) => {
    await header.ensureLightTheme()
    await header.goSettings()
    await expect(settingsPage.modeOption('Clair')).toHaveAttribute('aria-pressed', 'true')

    await header.goHome()
    await header.toggleTheme()

    await header.goSettings()
    await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
  })

  test("la couleur choisie dans la page est reprise par la palette de l'en-tête", async ({ header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.chooseColor('Sarcelle')
    await expect(settingsPage.colorSwatch('Sarcelle')).toHaveAttribute('aria-pressed', 'true')

    await header.goHome()
    await header.openPalette()
    await expect(header.paletteSwatch('Sarcelle')).toHaveAttribute('aria-pressed', 'true')
  })

  test('les réglages sont conservés après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.chooseMode('Clair')
    await settingsPage.chooseColor('Orange')

    await page.reload()

    await header.expectDarkModeDisabled()
    await expect(settingsPage.modeOption('Clair')).toHaveAttribute('aria-pressed', 'true')
    await expect(settingsPage.colorSwatch('Orange')).toHaveAttribute('aria-pressed', 'true')
  })

  test('le reset de test remet les réglages par défaut', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.chooseMode('Clair')
    await settingsPage.chooseColor('Orange')

    const res = await page.request.post(`${API}/test/reset`)
    expect(res.ok()).toBeTruthy()

    // Même parcours que la fixture cleanState : démarrage à neuf sur le tableau
    await page.evaluate(() => {
      window.location.hash = '#/'
    })
    await page.reload()
    await header.goSettings()

    // Valeurs par défaut du schéma : mode sombre, thème Violet
    await header.expectDarkModeEnabled()
    await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
    await expect(settingsPage.colorSwatch('Violet')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Mode système', () => {
  test("suit le réglage clair ou sombre de l'OS", async ({ page, header, settingsPage }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await header.goSettings()
    await settingsPage.chooseMode('Système')

    await expect(settingsPage.modeOption('Système')).toHaveAttribute('aria-pressed', 'true')
    await header.expectDarkModeEnabled()

    // L'OS passe en clair : l'app suit sans rechargement
    await page.emulateMedia({ colorScheme: 'light' })
    await header.expectDarkModeDisabled()

    await header.goHome()
    await expect(header.themeButton.locator('.pi-moon')).toBeVisible()
  })

  test("le bouton de l'en-tête quitte le mode système pour le mode inverse", async ({ page, header, settingsPage }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await header.goSettings()
    await settingsPage.chooseMode('Système')
    await header.expectDarkModeDisabled()

    await header.goHome()
    await header.toggleTheme()
    await header.expectDarkModeEnabled()

    await header.goSettings()
    await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
  })

  test('est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await header.goSettings()
    await settingsPage.chooseMode('Système')

    await page.reload()

    await expect(settingsPage.modeOption('Système')).toHaveAttribute('aria-pressed', 'true')
    await header.expectDarkModeDisabled()
  })
})

test.describe("Taille de l'interface", () => {
  test('100 % par défaut, sans zoom', async ({ electronApp, header, settingsPage }) => {
    await header.goSettings()

    await expect(settingsPage.interfaceScaleOption('100 %')).toHaveAttribute('aria-pressed', 'true')
    expect(await zoomFactor(electronApp)).toBe(1)
  })

  test("la taille choisie zoome toute l'interface", async ({ electronApp, header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.interfaceScaleOption('125 %').click()
    await expect.poll(() => zoomFactor(electronApp)).toBe(1.25)

    await settingsPage.interfaceScaleOption('90 %').click()
    await expect.poll(() => zoomFactor(electronApp)).toBe(0.9)
  })

  test('est conservée après un rechargement', async ({ page, electronApp, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.interfaceScaleOption('110 %').click()
    await expect.poll(() => zoomFactor(electronApp)).toBe(1.1)

    await page.reload()

    await expect(settingsPage.interfaceScaleOption('110 %')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => zoomFactor(electronApp)).toBe(1.1)
  })

  test('revient à 100 % avec le reset de test', async ({ page, electronApp, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.interfaceScaleOption('125 %').click()
    await expect.poll(() => zoomFactor(electronApp)).toBe(1.25)

    const res = await page.request.post(`${API}/test/reset`)
    expect(res.ok()).toBeTruthy()

    await expect.poll(() => zoomFactor(electronApp)).toBe(1)
  })
})
