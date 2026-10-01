import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet de la page Paramètres
 */
export class SettingsPage {
  /**
   * Attributs
   */
  readonly page: Page
  readonly root: Locator
  readonly appearanceSection: Locator
  readonly modeSelect: Locator
  readonly colorRow: Locator

  /**
   * Constructeur
   *
   * @param page Current page
   */
  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('settings-page')

    // Section Apparence
    this.appearanceSection = this.root.getByTestId('settings-appearance')
    this.modeSelect = this.appearanceSection.getByTestId('settings-mode')
    this.colorRow = this.appearanceSection.getByTestId('settings-row-color')
  }

  /**
   * Option du sélecteur de mode.
   * @param label Libellé exact (« Clair » ou « Sombre »)
   */
  modeOption(label: 'Clair' | 'Sombre'): Locator {
    return this.modeSelect.getByRole('button', { name: label, exact: true })
  }

  /**
   * Pastille d'un thème de couleur dans la page.
   * @param label Libellé exact du thème (ex. « Sarcelle »)
   */
  colorSwatch(label: string): Locator {
    return this.colorRow.getByRole('button', { name: label, exact: true })
  }

  async chooseMode(label: 'Clair' | 'Sombre') {
    await this.modeOption(label).click()
  }

  async chooseColor(label: string) {
    await this.colorSwatch(label).click()
  }

  async expectVisible() {
    await expect(this.root).toBeVisible()
  }

  async expectHidden() {
    await expect(this.root).toHaveCount(0)
  }
}
