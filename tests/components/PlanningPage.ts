import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet de la vue Planning de la page du tableau : sous-menu des modes du rail, barre de
 * navigation, grille de FullCalendar (cellules repérées par leur `data-date`) et
 * panneau « À planifier ».
 */
export class PlanningPage {
  readonly page: Page
  readonly railEntry: Locator
  readonly viewMenuButton: Locator
  readonly viewMenu: Locator
  readonly root: Locator
  readonly calendar: Locator
  readonly title: Locator
  readonly previousButton: Locator
  readonly nextButton: Locator
  readonly todayButton: Locator
  readonly scale: Locator
  readonly boardFilter: Locator
  readonly panel: Locator
  readonly unscheduled: Locator
  readonly overdue: Locator
  readonly events: Locator
  readonly projections: Locator
  readonly filterEmpty: Locator
  readonly cardMenu: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page
    this.railEntry = page.getByTestId('btn-home')
    this.viewMenuButton = page.getByTestId('btn-board-view-menu')
    this.viewMenu = page.getByTestId('board-view-menu')
    this.root = page.getByTestId('planning')
    this.calendar = page.getByTestId('planning-calendar')
    this.title = page.getByTestId('planning-title')
    this.previousButton = page.getByTestId('btn-planning-prev')
    this.nextButton = page.getByTestId('btn-planning-next')
    this.todayButton = page.getByTestId('btn-planning-today')
    this.scale = page.getByTestId('planning-scale')
    this.boardFilter = page.getByTestId('planning-board-filter')
    this.panel = page.getByTestId('planning-panel')
    this.unscheduled = page.getByTestId('planning-unscheduled')
    this.overdue = page.getByTestId('planning-overdue')
    this.events = page.getByTestId('planning-event')
    this.projections = page.getByTestId('planning-projection')
    this.filterEmpty = page.getByTestId('filter-empty')
    this.cardMenu = page.getByTestId('card-menu')
  }

  /**
   * Choisit un mode d'affichage dans le sous-menu du rail, déplié au besoin.
   * @param label Libellé du mode
   */
  private async chooseView(label: string) {
    if ((await this.viewMenuButton.getAttribute('aria-expanded')) !== 'true') await this.viewMenuButton.click()
    await this.viewMenu.getByRole('button', { name: label, exact: true }).click()
  }

  /** Passe à la vue Planning et attend le calendrier. */
  async open() {
    await this.chooseView('Planning')
    await expect(this.calendar).toBeVisible()
  }

  /** Revient au Kanban et attend ses colonnes. */
  async backToKanban() {
    await this.chooseView('Kanban')
    await expect(this.page.getByTestId('stage-column').first()).toBeVisible()
  }

  /**
   * Période affichée, telle qu'écrite dans la page. Pas `innerText`, qui renvoie la
   * majuscule posée par le CSS alors que `toHaveText` compare le texte de la page.
   */
  async periodTitle(): Promise<string> {
    await expect(this.title).not.toBeEmpty()
    return (await this.title.textContent()) ?? ''
  }

  /**
   * Choisit l'échelle.
   * @param label Libellé affiché
   */
  async chooseScale(label: 'Mois' | 'Semaine') {
    await this.scale.getByRole('button', { name: label, exact: true }).click()
  }

  /**
   * Option de l'échelle, pour lire son état.
   * @param label Libellé affiché
   */
  scaleOption(label: 'Mois' | 'Semaine'): Locator {
    return this.scale.getByRole('button', { name: label, exact: true })
  }

  /**
   * Clé locale d'un jour, celle du `data-date` des cellules.
   * @param date Jour
   */
  static dayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
  }

  /**
   * Cellule d'un jour de la grille.
   * @param date Jour
   */
  cell(date: Date): Locator {
    return this.calendar.locator(`[role="cell"][data-date="${PlanningPage.dayKey(date)}"]`)
  }

  /**
   * Lien du numéro d'un jour, qui crée une tâche.
   * @param date Jour
   */
  dayLink(date: Date): Locator {
    return this.cell(date).locator('.planning-day-link')
  }

  /**
   * Carte de la grille par le titre de sa tâche.
   * @param title Titre
   */
  event(title: string): Locator {
    return this.events.filter({ hasText: title })
  }

  /**
   * Carte d'un jour par le titre de sa tâche.
   * @param date Jour
   * @param title Titre
   */
  eventOn(date: Date, title: string): Locator {
    return this.cell(date).getByTestId('planning-event').filter({ hasText: title })
  }

  /**
   * Carte du panneau par le titre de sa tâche.
   * @param title Titre
   */
  panelCard(title: string): Locator {
    return this.panel.getByTestId('planning-panel-card').filter({ hasText: title })
  }

  /**
   * Lien « +N » d'un jour chargé.
   * @param date Jour
   */
  moreLink(date: Date): Locator {
    return this.cell(date).getByText(/^\+\d+$/)
  }

  /**
   * Coche ou décoche un tableau dans le filtre par tableau.
   * @param name Nom du tableau
   */
  async toggleBoard(name: string) {
    await this.boardFilter.click()
    const option = this.page.getByRole('option', { name })
    await option.click()
    await this.page.keyboard.press('Escape')
    // Liste refermée : elle rend le focus en se fermant, et l'ôterait à un champ rempli entre-temps
    await expect(option).toBeHidden()
  }

  /**
   * Glisse un élément sur un autre, à la souris : le calendrier détecte le drag
   * sur les événements de la souris, après un petit déplacement.
   * @param source Élément tenu
   * @param target Élément d'arrivée
   */
  async drag(source: Locator, target: Locator) {
    await source.scrollIntoViewIfNeeded()
    const from = await source.boundingBox()
    const to = await target.boundingBox()
    if (!from || !to) throw new Error('Élément du glisser-déposer introuvable')

    const [fromX, fromY] = [from.x + from.width / 2, from.y + from.height / 2]
    await this.page.mouse.move(fromX, fromY)
    await this.page.mouse.down()
    await this.page.mouse.move(fromX + 8, fromY + 8, { steps: 5 })
    await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
    await this.page.mouse.up()
  }
}
