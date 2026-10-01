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
  readonly newTaskPositionSelect: Locator
  readonly confirmArchiveSwitch: Locator
  readonly notificationsSwitch: Locator
  readonly notificationStyleSelect: Locator
  readonly traySwitch: Locator
  readonly startupSwitch: Locator
  readonly minimizedSwitch: Locator

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

    // Section Tâches : position d'une nouvelle tâche
    this.newTaskPositionSelect = this.root.getByTestId('settings-new-task-position')

    // Section Notifications : style des rappels
    this.notificationStyleSelect = this.root.getByTestId('settings-notification-style')

    // Interrupteurs (role switch porté par l'input interne du ToggleSwitch)
    this.confirmArchiveSwitch = this.root.getByRole('switch', { name: "Confirmer l'archivage" })
    this.notificationsSwitch = this.root.getByRole('switch', { name: 'Rappels de date de début' })
    this.traySwitch = this.root.getByRole('switch', { name: 'Garder en arrière-plan' })
    this.startupSwitch = this.root.getByRole('switch', { name: "Lancer à l'ouverture de session" })
    this.minimizedSwitch = this.root.getByRole('switch', { name: 'Démarrer réduite' })
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

  /**
   * Option du sélecteur de position d'une nouvelle tâche.
   * @param label Libellé exact (« En haut » ou « En bas »)
   */
  newTaskPositionOption(label: 'En haut' | 'En bas'): Locator {
    return this.newTaskPositionSelect.getByRole('button', { name: label, exact: true })
  }

  /**
   * Option du sélecteur de style des rappels.
   * @param label Libellé exact (« Persistante » ou « Temporaire »)
   */
  notificationStyleOption(label: 'Persistante' | 'Temporaire'): Locator {
    return this.notificationStyleSelect.getByRole('button', { name: label, exact: true })
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
