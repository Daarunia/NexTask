import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet de l'en-tête de l'application
 */
export class Header {
  /**
   * Attributs
   */
  readonly page: Page
  readonly themeButton: Locator
  readonly homeButton: Locator
  readonly settingsButton: Locator
  readonly paletteButton: Locator
  readonly palettePanel: Locator
  readonly paletteSwatches: Locator
  readonly paletteLabel: Locator

  /**
   * Constructeur
   *
   * @param page Current page
   */
  constructor(page: Page) {
    this.page = page

    // Bouton dark / light
    this.themeButton = page.getByTestId('btn-theme')

    // Navigation paramètre / acceuil
    this.homeButton = page.getByTestId('btn-home')
    this.settingsButton = page.getByTestId('btn-settings')

    // Sélecteur de la couleur primaire
    this.paletteButton = page.getByTestId('btn-palette')
    // Limité au popover : la page Paramètres affiche aussi un sélecteur de couleur
    this.palettePanel = page.getByRole('dialog').getByTestId('palette-panel')
    this.paletteSwatches = this.palettePanel.getByTestId('palette-swatch')
    this.paletteLabel = this.palettePanel.getByTestId('palette-label')
  }

  /**
   * Pastille d'un thème dans la palette ouverte.
   * @param label Libellé exact du thème (ex. « Sarcelle »)
   */
  paletteSwatch(label: string): Locator {
    return this.palettePanel.getByRole('button', { name: label, exact: true })
  }

  async toggleTheme() {
    await this.themeButton.click()
  }

  /**
   * Force l'application en thème clair.
   */
  async ensureLightTheme() {
    const html = this.page.locator('html')
    if (((await html.getAttribute('class')) ?? '').includes('app-dark')) {
      await this.themeButton.click()
    }
    await expect(html).not.toHaveClass(/app-dark/)
  }

  async openPalette() {
    await this.paletteButton.click()
  }

  async closePaletteByOutsideClick() {
    await this.page.mouse.click(100, 100)
  }

  async goHome() {
    await this.homeButton.click()
  }

  async goSettings() {
    await this.settingsButton.click()
  }

  async expectDarkModeEnabled() {
    await expect(this.page.locator('html')).toHaveClass(/app-dark/)
  }

  async expectDarkModeDisabled() {
    await expect(this.page.locator('html')).not.toHaveClass(/app-dark/)
  }

  async expectPaletteOpen() {
    await expect(this.palettePanel).toBeVisible()
  }

  async expectPaletteClosed() {
    await expect(this.palettePanel).toHaveCount(0)
  }
}
