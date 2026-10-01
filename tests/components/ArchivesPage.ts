import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet de la page des tâches archivées (ouverte depuis la page Paramètres)
 */
export class ArchivesPage {
  /**
   * Attributs
   */
  readonly page: Page
  readonly root: Locator
  readonly items: Locator
  readonly titles: Locator
  readonly count: Locator
  readonly empty: Locator
  readonly backButton: Locator

  // Bulle de confirmation de la suppression définitive
  readonly confirmPopup: Locator
  readonly confirmAcceptButton: Locator
  readonly confirmRejectButton: Locator

  /**
   * Constructeur
   *
   * @param page Current page
   */
  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('archives-page')
    this.items = this.root.getByTestId('archived-task')
    this.titles = this.items.getByTestId('archived-task-title')
    this.count = this.root.getByTestId('archives-count')
    this.empty = this.root.getByTestId('archives-empty')
    this.backButton = this.root.getByTestId('btn-archives-back')

    this.confirmPopup = page.getByTestId('confirm-popup')
    this.confirmAcceptButton = page.getByTestId('btn-confirm-accept')
    this.confirmRejectButton = page.getByTestId('btn-confirm-reject')
  }

  /**
   * Ligne d'une tâche archivée, repérée par son titre exact.
   * @param title Titre exact de la tâche
   */
  item(title: string): Locator {
    return this.items.filter({ has: this.page.getByText(title, { exact: true }) })
  }

  /**
   * Date d'archivage d'une ligne (élément <time>, attribut `datetime` en ISO).
   * @param title Titre exact de la tâche
   */
  date(title: string): Locator {
    return this.item(title).getByTestId('archived-task-date')
  }

  /**
   * Chips de tags d'une ligne, dans l'ordre d'affichage.
   * @param title Titre exact de la tâche
   */
  tags(title: string): Locator {
    return this.item(title).getByTestId('archived-task-tag')
  }

  /**
   * Titres affichés, dans l'ordre de la liste (haut → bas).
   */
  async titleList(): Promise<string[]> {
    return (await this.titles.allInnerTexts()).map((t) => t.trim())
  }

  /**
   * Restaure une tâche archivée.
   * @param title Titre exact de la tâche
   */
  async restore(title: string) {
    await this.item(title).getByTestId('btn-restore-task').click()
  }

  /**
   * Ouvre la confirmation de suppression définitive d'une tâche.
   * @param title Titre exact de la tâche
   */
  async askDelete(title: string) {
    await this.item(title).getByTestId('btn-delete-task').click()
    await expect(this.confirmPopup).toBeVisible()
  }

  async expectVisible() {
    await expect(this.root).toBeVisible()
  }
}
