import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E de la page Paramètres : navigation depuis l'en-tête, synchronisation
 * des réglages avec l'en-tête, persistance et remise à zéro entre deux tests.
 */

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

  test("le mode choisi dans la page s'applique et met l'en-tête à jour", async ({ header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.chooseMode('Clair')
    await header.expectDarkModeDisabled()
    await expect(header.themeButton.locator('.pi-moon')).toBeVisible()

    await settingsPage.chooseMode('Sombre')
    await header.expectDarkModeEnabled()
    await expect(header.themeButton.locator('.pi-sun')).toBeVisible()
  })

  test("le bouton de l'en-tête met à jour le mode affiché dans la page", async ({ header, settingsPage }) => {
    await header.goSettings()
    await header.ensureLightTheme()

    await expect(settingsPage.modeOption('Clair')).toHaveAttribute('aria-pressed', 'true')

    await header.toggleTheme()
    await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
  })

  test("la couleur choisie dans la page est reprise par la palette de l'en-tête", async ({ header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.chooseColor('Sarcelle')
    await expect(settingsPage.colorSwatch('Sarcelle')).toHaveAttribute('aria-pressed', 'true')

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

    const res = await page.request.post('http://localhost:3000/test/reset')
    expect(res.ok()).toBeTruthy()
    await page.reload()

    // Valeurs par défaut du schéma : mode sombre, thème Violet
    await header.expectDarkModeEnabled()
    await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
    await expect(settingsPage.colorSwatch('Violet')).toHaveAttribute('aria-pressed', 'true')
  })
})
