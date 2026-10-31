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
  // Recherche, et message quand aucune tâche ne correspond
  readonly search: Locator
  readonly noMatch: Locator
  // Filtre par tableau, présent avec plusieurs tableaux ou des tâches d'un tableau supprimé
  readonly boardFilter: Locator

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
    this.search = this.root.getByTestId('archives-search')
    this.noMatch = this.root.getByTestId('archives-no-match')
    this.boardFilter = this.root.getByTestId('archives-board-filter')
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
   * Badge d'avancement de la checklist d'une ligne (« 2/3 »), absent sans point.
   * @param title Titre exact de la tâche
   */
  checklistBadge(title: string): Locator {
    return this.item(title).getByTestId('archived-task-checklist')
  }

  /**
   * Tableau d'une ligne (pastille et nom, « Tableau supprimé »), absent avec un seul tableau.
   * @param title Titre exact de la tâche
   */
  boardOf(title: string): Locator {
    return this.item(title).getByTestId('archived-task-board')
  }

  /**
   * Filtre la liste sur un tableau.
   * @param name Nom exact du choix (« Tous les tableaux », un tableau, « Tableau supprimé »)
   */
  async filterByBoard(name: string) {
    await this.boardFilter.click()
    await this.page.getByRole('option', { name, exact: true }).click()
    await expect(this.boardFilter).toContainText(name)
  }

  /**
   * Bouton de restauration d'une ligne (« Restaurer », ou « Restaurer ici » pour un tableau supprimé).
   * @param title Titre exact de la tâche
   */
  restoreButton(title: string): Locator {
    return this.item(title).getByTestId('btn-restore-task')
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
   * Supprime définitivement une tâche (annulable tant que le toast est affiché).
   * @param title Titre exact de la tâche
   */
  async delete(title: string) {
    await this.item(title).getByTestId('btn-delete-task').click()
  }

  async expectVisible() {
    await expect(this.root).toBeVisible()
  }
}
