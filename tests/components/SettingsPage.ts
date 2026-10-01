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
  readonly rememberFilterSwitch: Locator
  readonly confirmArchiveSwitch: Locator
  readonly notificationsSwitch: Locator
  readonly notificationStyleSelect: Locator
  readonly traySwitch: Locator
  readonly startupSwitch: Locator
  readonly minimizedSwitch: Locator
  readonly windowModeSelect: Locator
  readonly tagList: Locator
  readonly tagItems: Locator
  readonly tagsEmpty: Locator
  readonly tagNameInput: Locator
  readonly tagError: Locator
  readonly tagColors: Locator
  readonly confirmPopup: Locator
  readonly confirmAcceptButton: Locator
  readonly confirmRejectButton: Locator
  readonly openArchivesButton: Locator
  readonly archivePurgeSwitch: Locator
  readonly archivePurgeDaysSelect: Locator
  readonly exportButton: Locator
  readonly importButton: Locator
  readonly autoBackupSwitch: Locator
  readonly openDataFolderButton: Locator
  readonly openLogsFolderButton: Locator
  readonly appVersion: Locator
  readonly openReleaseNotesButton: Locator
  readonly openNoticesButton: Locator

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
    this.rememberFilterSwitch = this.root.getByRole('switch', { name: 'Mémoriser le filtre de tags' })
    this.confirmArchiveSwitch = this.root.getByRole('switch', { name: "Confirmer l'archivage" })
    this.notificationsSwitch = this.root.getByRole('switch', { name: 'Rappels de date de début' })
    this.traySwitch = this.root.getByRole('switch', { name: 'Garder en arrière-plan' })
    this.startupSwitch = this.root.getByRole('switch', { name: "Lancer à l'ouverture de session" })
    this.minimizedSwitch = this.root.getByRole('switch', { name: 'Démarrer réduite' })

    // Section Démarrage : fenêtre maximisée ou à sa dernière taille
    this.windowModeSelect = this.root.getByTestId('settings-window-mode')

    // Section Tags : liste des tags et leurs éditions
    this.tagList = this.root.getByTestId('settings-tag-list')
    this.tagItems = this.tagList.getByTestId('settings-tag')
    this.tagsEmpty = this.tagList.getByTestId('settings-tags-empty')
    this.tagNameInput = this.tagList.getByTestId('settings-tag-name-input')
    this.tagError = this.tagList.getByTestId('settings-tag-error')
    // Palette ouverte dans un popover, hors de la page
    this.tagColors = page.getByTestId('settings-tag-colors')

    // Bulle de confirmation (suppression d'un tag)
    this.confirmPopup = page.getByTestId('confirm-popup')
    this.confirmAcceptButton = page.getByTestId('btn-confirm-accept')
    this.confirmRejectButton = page.getByTestId('btn-confirm-reject')

    // Section Organisation et données : archives et purge automatique
    this.openArchivesButton = this.root.getByTestId('btn-open-archives')
    this.archivePurgeSwitch = this.root.getByRole('switch', { name: 'Purge automatique des archives' })
    this.archivePurgeDaysSelect = this.root.getByTestId('settings-archive-purge-days')

    // Section Organisation et données : export, import et sauvegarde automatique
    this.exportButton = this.root.getByTestId('btn-data-export')
    this.importButton = this.root.getByTestId('btn-data-import')
    this.autoBackupSwitch = this.root.getByRole('switch', { name: 'Sauvegarde automatique' })

    // Section Organisation et données : ouverture des dossiers
    this.openDataFolderButton = this.root.getByTestId('btn-open-data-folder')
    this.openLogsFolderButton = this.root.getByTestId('btn-open-logs-folder')

    // Section À propos : version et liens externes
    this.appVersion = this.root.getByTestId('settings-app-version')
    this.openReleaseNotesButton = this.root.getByTestId('btn-open-release-notes')
    this.openNoticesButton = this.root.getByTestId('btn-open-notices')
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
   * Option du sélecteur de fenêtre au démarrage.
   * @param label Libellé exact (« Maximisée » ou « Dernière taille »)
   */
  windowModeOption(label: 'Maximisée' | 'Dernière taille'): Locator {
    return this.windowModeSelect.getByRole('button', { name: label, exact: true })
  }

  /**
   * Option du sélecteur de style des rappels.
   * @param label Libellé exact (« Persistante » ou « Temporaire »)
   */
  notificationStyleOption(label: 'Persistante' | 'Temporaire'): Locator {
    return this.notificationStyleSelect.getByRole('button', { name: label, exact: true })
  }

  /**
   * Ligne d'un tag dans la liste des Paramètres.
   * @param name Nom exact du tag
   */
  tag(name: string): Locator {
    return this.tagList.locator(`[data-testid="settings-tag"][data-tag-name="${name}"]`)
  }

  /**
   * Chip d'un tag dans la liste (attribut `data-tag-color` = couleur).
   * @param name Nom exact du tag
   */
  tagChip(name: string): Locator {
    return this.tag(name).locator('.tag-chip')
  }

  /**
   * Noms des tags, dans l'ordre de la liste.
   */
  async tagNames(): Promise<string[]> {
    return this.tagItems.evaluateAll((items) => items.map((item) => item.getAttribute('data-tag-name') ?? ''))
  }

  /**
   * Ouvre le renommage d'un tag et saisit un nom, sans valider.
   * @param name Nom actuel
   * @param newName Nom saisi
   */
  async typeTagName(name: string, newName: string) {
    await this.tag(name).getByTestId('btn-tag-rename').click()
    await this.tagNameInput.fill(newName)
  }

  /**
   * Renomme un tag (saisie puis Entrée).
   * @param name Nom actuel
   * @param newName Nouveau nom
   */
  async renameTag(name: string, newName: string) {
    await this.typeTagName(name, newName)
    await this.tagNameInput.press('Enter')
  }

  /**
   * Ouvre une bulle (confirmation, palette) depuis son déclencheur, centré au
   * préalable dans la page. Les bulles PrimeVue se ferment dès que la page
   * défile : ouvertes près d'un bord, elles débordent de la fenêtre et
   * Playwright ferait défiler la page pour atteindre leurs boutons.
   * @param trigger Bouton qui ouvre la bulle
   */
  async openPopupFrom(trigger: Locator) {
    await trigger.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await trigger.click()
  }

  /**
   * Change la couleur d'un tag via sa palette.
   * @param name Nom du tag
   * @param color Nom de la couleur (ex. « violet »)
   */
  async chooseTagColor(name: string, color: string) {
    await this.openPopupFrom(this.tag(name).getByTestId('btn-tag-color'))
    await expect(this.tagColors).toBeVisible()
    await this.tagColors.locator(`[data-testid="tag-edit-color"][data-color="${color}"]`).click()
  }

  /**
   * Ouvre la confirmation de suppression d'un tag.
   * @param name Nom du tag
   */
  async askDeleteTag(name: string) {
    await this.openPopupFrom(this.tag(name).getByTestId('btn-tag-delete'))
    await expect(this.confirmPopup).toBeVisible()
  }

  /**
   * Ouvre la confirmation d'import des données.
   */
  async askImport() {
    await this.openPopupFrom(this.importButton)
    await expect(this.confirmPopup).toBeVisible()
  }

  /**
   * Option du sélecteur d'ancienneté avant purge des archives.
   * @param label Libellé exact (« 30 jours », « 90 jours » ou « 1 an »)
   */
  archivePurgeDaysOption(label: '30 jours' | '90 jours' | '1 an'): Locator {
    return this.archivePurgeDaysSelect.getByRole('button', { name: label, exact: true })
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
