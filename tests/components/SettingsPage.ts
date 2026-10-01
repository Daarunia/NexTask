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
  readonly versions: Locator
  readonly versionItems: Locator
  readonly versionInput: Locator
  readonly versionAddButton: Locator
  readonly versionError: Locator
  readonly notificationsSwitch: Locator

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

    // Section Tâches : versions proposées
    this.versions = this.root.getByTestId('settings-versions')
    this.versionItems = this.versions.getByTestId('settings-version')
    this.versionInput = this.versions.getByTestId('settings-version-input')
    this.versionAddButton = this.versions.getByTestId('btn-version-add')
    this.versionError = this.versions.getByTestId('settings-version-error')

    // Interrupteurs (role switch porté par l'input interne du ToggleSwitch)
    this.notificationsSwitch = this.root.getByRole('switch', { name: 'Rappels de date de début' })
  }

  /**
   * Ligne d'une version dans la liste.
   * @param version Numéro de version exact
   */
  version(version: string): Locator {
    return this.versions.locator(`[data-testid="settings-version"][data-version="${version}"]`)
  }

  /**
   * Ajoute une version via le champ de saisie.
   * @param version Version à saisir
   */
  async addVersion(version: string) {
    await this.versionInput.fill(version)
    await this.versionAddButton.click()
  }

  /**
   * Fait d'une version la version par défaut.
   * @param version Version concernée
   */
  async setDefaultVersion(version: string) {
    await this.version(version).getByTestId('btn-version-default').click()
  }

  /**
   * Retire une version de la liste.
   * @param version Version à retirer
   */
  async removeVersion(version: string) {
    await this.version(version).getByTestId('btn-version-remove').click()
  }

  /**
   * Option du sélecteur de mode.
   * @param label Libellé exact (« Clair », « Sombre » ou « Système »)
   */
  modeOption(label: 'Clair' | 'Sombre' | 'Système'): Locator {
    return this.modeSelect.getByRole('button', { name: label, exact: true })
  }

  /**
   * Pastille d'un thème de couleur dans la page.
   * @param label Libellé exact du thème (ex. « Sarcelle »)
   */
  colorSwatch(label: string): Locator {
    return this.colorRow.getByRole('button', { name: label, exact: true })
  }

  async chooseMode(label: 'Clair' | 'Sombre' | 'Système') {
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
