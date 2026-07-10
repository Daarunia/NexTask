import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet page du tableau Kanban et de l'écran de tâche (TaskDialog).
 *
 * Regroupe le ciblage et les gestes de l'écran de tâche : ouverture en
 * création / édition depuis une colonne, remplissage des champs, sauvegarde,
 * annulation et archivage d'une carte.
 */
export class TaskBoard {
  readonly page: Page

  // Écran de tâche (TaskDialog)
  readonly dialog: Locator
  readonly titleInput: Locator
  readonly descriptionInput: Locator
  readonly versionSelect: Locator
  readonly saveButton: Locator
  readonly cancelButton: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page

    this.dialog = page.getByTestId('task-dialog')
    this.titleInput = page.getByTestId('task-title-input')
    this.descriptionInput = page.getByTestId('task-description-input')
    this.versionSelect = page.getByTestId('task-version-select')
    this.saveButton = page.getByTestId('task-save-btn')
    this.cancelButton = page.getByTestId('task-cancel-btn')
  }

  /**
   * Colonne (stage) repérée par son titre exact.
   * @param name Nom de la colonne (ex : "A faire")
   */
  column(name: string): Locator {
    return this.page.getByTestId('stage-column').filter({
      has: this.page.getByRole('heading', { name, exact: true }),
    })
  }

  /**
   * Carte de tâche repérée par son titre exact (sur tout le tableau).
   * @param title Titre exact de la tâche
   */
  taskCard(title: string): Locator {
    return this.page.getByTestId('task-card').filter({
      has: this.page.getByText(title, { exact: true }),
    })
  }

  /**
   * Ouvre l'écran de tâche en mode création depuis une colonne.
   * @param columnName Nom de la colonne
   */
  async openCreateDialog(columnName: string) {
    await this.column(columnName).getByTestId('btn-add-task').click()
    await expect(this.dialog).toBeVisible()
  }

  /**
   * Ouvre l'écran de tâche en mode édition pour une carte donnée.
   * @param title Titre exact de la tâche à éditer
   */
  async openEditDialog(title: string) {
    const card = this.taskCard(title)
    await card.hover()
    await card.getByTestId('btn-edit-task').click()
    await expect(this.dialog).toBeVisible()
  }

  /**
   * Sélectionne une version dans le Select PrimeVue.
   * @param version Libellé de la version (ex : "1.4.5")
   */
  async selectVersion(version: string) {
    await this.versionSelect.click()
    await this.page.getByRole('option', { name: version, exact: true }).click()
  }

  /**
   * Remplit les champs présents puis enregistre (création ou édition selon le
   * dialog ouvert). Les champs non fournis sont laissés en l'état.
   */
  async fillAndSave(data: { title?: string; description?: string; version?: string }) {
    if (data.title !== undefined) await this.titleInput.fill(data.title)
    if (data.description !== undefined) await this.descriptionInput.fill(data.description)
    if (data.version !== undefined) await this.selectVersion(data.version)

    await this.saveButton.click()
    await expect(this.dialog).toBeHidden()
  }

  /**
   * Crée une tâche complète dans une colonne (ouverture + saisie + save).
   * @param columnName Nom de la colonne
   * @param data Données de la tâche
   */
  async createTask(columnName: string, data: { title: string; description?: string; version?: string }) {
    await this.openCreateDialog(columnName)
    await this.fillAndSave(data)
  }

  /**
   * Archive une carte via son bouton corbeille.
   * @param title Titre exact de la tâche à archiver
   */
  async archiveTask(title: string) {
    const card = this.taskCard(title)
    await card.hover()
    await card.getByTestId('btn-archive-task').click()
  }

  /**
   * Ouvre le formulaire "Ajouter une liste" et saisit un nom (sans valider).
   * @param name Nom de la colonne à saisir
   */
  async startAddStage(name: string) {
    await this.page.getByTestId('btn-add-stage').click()
    await this.page.getByTestId('stage-name-input').fill(name)
  }

  /** Annule le formulaire d'ajout de colonne. */
  async cancelAddStage() {
    await this.page.getByTestId('btn-cancel-stage').click()
  }

  /**
   * Ajoute une nouvelle colonne via le formulaire "Ajouter une liste".
   * @param name Nom de la colonne à créer
   */
  async addStage(name: string) {
    await this.startAddStage(name)
    await this.page.getByTestId('btn-confirm-stage').click()
    await expect(this.column(name)).toHaveCount(1)
  }

  /**
   * Renomme une colonne : double-clic sur son titre puis saisie du nouveau nom.
   * @param oldName Nom actuel
   * @param newName Nouveau nom
   */
  async renameStage(oldName: string, newName: string) {
    await this.page.getByRole('heading', { name: oldName, exact: true }).dblclick()
    const input = this.page.getByTestId('stage-edit-input')
    await input.fill(newName)
    await input.press('Enter')
    await expect(this.page.getByRole('heading', { name: newName, exact: true })).toBeVisible()
  }

  /**
   * Noms des colonnes, dans l'ordre d'affichage (gauche → droite).
   */
  async stageTitles(): Promise<string[]> {
    const titles = await this.page.getByTestId('stage-title').allInnerTexts()
    return titles.map((t) => t.trim())
  }

  /**
   * Ordre des seules colonnes connues (parmi `known`).
   * Robuste aux colonnes seedées/préexistantes de la base partagée.
   * @param known Noms de colonnes de test à conserver
   */
  async orderedStagesAmong(known: string[]): Promise<string[]> {
    const all = await this.stageTitles()
    return all.filter((t) => known.includes(t))
  }

  /**
   * Déplace une colonne juste avant une autre (les colonnes sont horizontales,
   * on dépose près du bord gauche de la cible). Poignée = le titre (.stage-handle).
   * @param sourceName Colonne à déplacer
   * @param targetName Colonne de référence
   */
  async dragStageBefore(sourceName: string, targetName: string) {
    const source = this.page.getByRole('heading', {
      name: sourceName,
      exact: true,
    })
    const target = this.page.getByRole('heading', {
      name: targetName,
      exact: true,
    })

    await source.scrollIntoViewIfNeeded()
    const sb = await source.boundingBox()
    const tb = await target.boundingBox()
    if (!sb || !tb) throw new Error('Poignée de colonne introuvable pour le drag')

    const grabX = sb.x + sb.width / 2
    const grabY = sb.y + sb.height / 2
    const dropX = tb.x + 4
    const dropY = tb.y + tb.height / 2

    await this.page.mouse.move(grabX, grabY)
    await this.page.mouse.down()
    // Amorce horizontale (> fallbackTolerance)
    await this.page.mouse.move(grabX - 12, grabY, { steps: 6 })
    await this.page.mouse.move(dropX, dropY, { steps: 25 })
    await this.page.mouse.move(dropX, dropY, { steps: 5 })
    await this.page.mouse.up()
  }

  /**
   * Ouvre le menu contextuel (⋮) d'une colonne.
   * @param name Nom de la colonne
   */
  async openStageMenu(name: string) {
    await this.column(name).getByTestId('btn-stage-menu').click()
  }

  /**
   * Supprime une colonne via son menu contextuel (item "Supprimer").
   * @param name Nom de la colonne à supprimer
   */
  async deleteStage(name: string) {
    await this.openStageMenu(name)
    await this.page.getByRole('menuitem', { name: 'Supprimer' }).click()
  }

  /**
   * Titres des cartes d'une colonne, dans l'ordre d'affichage (haut → bas).
   * @param columnName Nom de la colonne
   */
  async columnTaskTitles(columnName: string): Promise<string[]> {
    const titles = await this.column(columnName).getByTestId('task-card').locator('strong').allInnerTexts()
    return titles.map((t) => t.trim())
  }

  /**
   * Ordre des seules tâches connues (parmi `known`) dans une colonne.
   *
   * Utile car la base est partagée : on ignore d'éventuelles cartes préexistantes
   * pour n'asserter que sur l'ordre relatif de nos tâches de test.
   * @param columnName Nom de la colonne
   * @param known Titres de test à conserver
   */
  async orderedTitlesAmong(columnName: string, known: string[]): Promise<string[]> {
    const all = await this.columnTaskTitles(columnName)
    return all.filter((t) => known.includes(t))
  }

  /**
   * Geste de drag bas niveau, compatible avec le mode fallback de SortableJS.
   *
   * On saisit la carte près de son bord gauche (au-dessus du titre, loin des
   * boutons d'action), on franchit le seuil `fallbackTolerance`, puis on approche
   * la cible en plusieurs paliers avant de relâcher.
   * @param sourceTitle Titre de la carte à déplacer
   * @param targetX Abscisse du point de dépôt
   * @param targetY Ordonnée du point de dépôt
   */
  private async performDrag(sourceTitle: string, targetX: number, targetY: number) {
    const source = this.taskCard(sourceTitle)
    await source.scrollIntoViewIfNeeded()
    const sb = await source.boundingBox()
    if (!sb) throw new Error(`Carte source introuvable : "${sourceTitle}"`)

    // Point de préhension : à gauche, sur le titre (évite les boutons à droite)
    const grabX = sb.x + 15
    const grabY = sb.y + sb.height / 2

    await this.page.mouse.move(grabX, grabY)
    await this.page.mouse.down()
    // Amorce le drag (déplacement > fallbackTolerance)
    await this.page.mouse.move(grabX, grabY + 12, { steps: 6 })
    // Approche progressive de la cible
    await this.page.mouse.move(targetX, targetY, { steps: 25 })
    // Petit palier final pour stabiliser l'index d'insertion
    await this.page.mouse.move(targetX, targetY, { steps: 5 })
    await this.page.mouse.up()
  }

  /**
   * Dépose une carte juste avant / après une autre carte (même colonne ou
   * colonne différente).
   * @param sourceTitle Carte à déplacer
   * @param targetTitle Carte de référence
   * @param where "before" (au-dessus) ou "after" (en dessous) de la cible
   */
  async dragTaskOntoCard(sourceTitle: string, targetTitle: string, where: 'before' | 'after' = 'before') {
    const tb = await this.taskCard(targetTitle).boundingBox()
    if (!tb) throw new Error(`Carte cible introuvable : "${targetTitle}"`)

    const x = tb.x + tb.width / 2
    const y = where === 'before' ? tb.y + 4 : tb.y + tb.height - 4
    await this.performDrag(sourceTitle, x, y)
  }

  /**
   * Déplace une carte à la fin d'une colonne cible (dépôt sous sa dernière
   * carte). La colonne cible doit contenir au moins une carte.
   * @param sourceTitle Carte à déplacer
   * @param columnName Colonne de destination
   */
  async dragTaskToColumnEnd(sourceTitle: string, columnName: string) {
    const last = this.column(columnName).getByTestId('task-card').last()
    const lb = await last.boundingBox()
    if (!lb) throw new Error(`Colonne "${columnName}" sans carte pour servir de cible de dépôt`)

    await this.performDrag(sourceTitle, lb.x + lb.width / 2, lb.y + lb.height - 4)
  }
}
