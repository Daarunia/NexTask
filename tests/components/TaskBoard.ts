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
  readonly titleError: Locator
  readonly descriptionEditor: Locator
  readonly descriptionInput: Locator
  readonly descriptionPlaceholder: Locator
  readonly descriptionPreview: Locator
  readonly descriptionEditButton: Locator
  readonly descriptionPreviewButton: Locator
  readonly versionSelect: Locator
  readonly startDateInput: Locator
  readonly saveButton: Locator
  readonly cancelButton: Locator

  // Bulle de confirmation (archivage avec le paramètre « confirmer l'archivage »)
  readonly confirmPopup: Locator
  readonly confirmAcceptButton: Locator
  readonly confirmRejectButton: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page

    this.dialog = page.getByTestId('task-dialog')
    this.titleInput = page.getByTestId('task-title-input')
    this.titleError = page.getByTestId('task-title-error')
    // Description Markdown (md-editor-v3) : zone de saisie CodeMirror, éditable
    // mais sans valeur de formulaire (toHaveText plutôt que toHaveValue).
    // Ouverte en aperçu quand la tâche a déjà une description.
    this.descriptionEditor = page.getByTestId('task-description-editor')
    this.descriptionInput = this.descriptionEditor.locator('.cm-content')
    this.descriptionPlaceholder = this.descriptionEditor.locator('.cm-placeholder')
    this.descriptionPreview = page.getByTestId('task-description-preview')
    this.descriptionEditButton = page.getByTestId('task-description-edit-btn')
    this.descriptionPreviewButton = page.getByTestId('task-description-preview-btn')
    this.versionSelect = page.getByTestId('task-version-select')
    // La DatePicker PrimeVue expose un <input> interne sous le data-testid
    this.startDateInput = page.getByTestId('task-startdate-input').locator('input')
    this.saveButton = page.getByTestId('task-save-btn')
    this.cancelButton = page.getByTestId('task-cancel-btn')

    this.confirmPopup = page.getByTestId('confirm-popup')
    this.confirmAcceptButton = page.getByTestId('btn-confirm-accept')
    this.confirmRejectButton = page.getByTestId('btn-confirm-reject')
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
   * Compteur de cartes affiché à côté du titre d'une colonne.
   * @param name Nom de la colonne
   */
  columnCount(name: string): Locator {
    return this.column(name).getByTestId('stage-count')
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
   * Chips de tags d'une carte, dans l'ordre d'affichage (gauche → droite).
   * @param title Titre exact de la tâche
   */
  taskCardTags(title: string): Locator {
    return this.taskCard(title).getByTestId('task-card-tag')
  }

  /**
   * Chip d'un tag sur une carte, repéré par son nom affiché.
   * @param title Titre exact de la tâche
   * @param tagName Nom exact du tag
   */
  taskCardTag(title: string, tagName: string): Locator {
    return this.taskCardTags(title).filter({ has: this.page.getByText(tagName, { exact: true }) })
  }

  /**
   * Retire un tag d'une carte sans ouvrir le dialogue. Survol du chip puis
   * clic sur sa croix.
   * @param title Titre exact de la tâche
   * @param tagName Nom exact du tag à retirer
   */
  async removeCardTag(title: string, tagName: string) {
    const chip = this.taskCardTag(title, tagName)
    await chip.hover()
    await chip.getByTestId('task-card-tag-remove').click()
  }

  /**
   * Ouvre l'écran de tâche en mode création depuis une colonne.
   * @param columnName Nom de la colonne
   */
  async openCreateDialog(columnName: string) {
    await this.column(columnName).getByTestId('btn-add-task').click()
    await this.waitForDialogOpened()
  }

  /**
   * Ouvre l'écran de tâche en mode édition pour une carte donnée.
   * @param title Titre exact de la tâche à éditer
   */
  async openEditDialog(title: string) {
    const card = this.taskCard(title)
    await card.hover()
    await card.getByTestId('btn-edit-task').click()
    await this.waitForDialogOpened()
  }

  /**
   * Attend que l'écran de tâche soit affiché et que son animation d'ouverture
   * (zoom de 300 ms) soit terminée. Pendant le zoom, Playwright peut faire défiler
   * le dialogue pour amener en vue un champ qu'il croit masqué, sur le petit écran
   * de la CI. L'événement de défilement n'arrive qu'à la frame suivante, une fois le
   * popover des tags ouvert par le clic, et PrimeVue le referme aussitôt.
   */
  async waitForDialogOpened() {
    await expect(this.dialog).toBeVisible()
    await this.dialog.evaluate(async (form) => {
      const dialog = form.closest('.p-dialog')
      await Promise.allSettled(dialog?.getAnimations().map((animation) => animation.finished) ?? [])
    })
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
   * Sélectionne le 1er jour du mois affiché dans la DatePicker (la saisie
   * clavier étant désactivée sur ce composant, on pilote le calendrier).
   * @returns La date attendue au format affiché "jj/mm/aaaa" (partie date seule)
   */
  async pickStartDateFirstOfMonth(): Promise<string> {
    await this.startDateInput.click()
    const panel = this.page.locator('.p-datepicker-panel')
    await expect(panel).toBeVisible()

    // Cellule "1" du mois courant (on exclut les jours débordant des autres mois)
    await panel.locator('td:not(.p-datepicker-other-month) span').filter({ hasText: /^1$/ }).first().click()

    // Referme l'overlay (showTime le laisse ouvert) pour libérer le bouton Save.
    // Sûr ici : la date est déjà sélectionnée au clic, Escape ne l'annule pas.
    await this.page.keyboard.press('Escape')
    await expect(panel).toBeHidden()

    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `01/${mm}/${now.getFullYear()}`
  }

  /**
   * Efface la date de début via le bouton « Effacer » de la barre de boutons
   * de la DatePicker (showButtonBar), qui remet le modèle à null et referme
   * l'overlay.
   */
  async clearStartDate() {
    await this.startDateInput.click()
    const panel = this.page.locator('.p-datepicker-panel')
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: 'Effacer', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(this.startDateInput).toHaveValue('')
  }

  /**
   * Saisit la description, en passant d'abord en écriture (sans effet si le
   * champ y est déjà, utile s'il s'est ouvert en aperçu).
   * @param text Texte Markdown
   */
  async fillDescription(text: string) {
    await this.descriptionEditButton.click()
    await this.descriptionInput.fill(text)
  }

  /**
   * Icône d'une carte signalant que la tâche a une description.
   * @param title Titre exact de la tâche
   */
  cardDescriptionIcon(title: string): Locator {
    return this.taskCard(title).getByTestId('task-card-description')
  }

  /**
   * Bouton de la barre d'outils de l'éditeur Markdown, repéré par son infobulle.
   * @param title Infobulle du bouton (ex : "Gras")
   */
  descriptionToolbarButton(title: string): Locator {
    return this.descriptionEditor.getByRole('button', { name: title, exact: true })
  }

  /**
   * Remplit les champs présents puis enregistre (création ou édition selon le
   * dialog ouvert). Les champs non fournis sont laissés en l'état.
   */
  async fillAndSave(data: { title?: string; description?: string; version?: string }) {
    if (data.title !== undefined) await this.titleInput.fill(data.title)
    if (data.description !== undefined) await this.fillDescription(data.description)
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
    const button = this.column(name).getByTestId('btn-stage-menu')

    // Défilement avant le clic
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(this.page.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible()
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
   *
   * Le point de dépôt est calculé après la mise en vue de la carte source : ce
   * défilement peut déplacer la cible (colonne ou tableau qui défile), et une
   * position mesurée avant fait lâcher la carte à côté (échec observé en CI).
   * @param sourceTitle Titre de la carte à déplacer
   * @param dropPoint Calcul du point de dépôt, une fois la source en vue
   */
  private async performDrag(sourceTitle: string, dropPoint: () => Promise<{ x: number; y: number }>) {
    const source = this.taskCard(sourceTitle)
    await source.scrollIntoViewIfNeeded()
    const sb = await source.boundingBox()
    if (!sb) throw new Error(`Carte source introuvable : "${sourceTitle}"`)
    const { x: targetX, y: targetY } = await dropPoint()

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
    await this.performDrag(sourceTitle, async () => {
      const tb = await this.taskCard(targetTitle).boundingBox()
      if (!tb) throw new Error(`Carte cible introuvable : "${targetTitle}"`)

      const y = where === 'before' ? tb.y + tb.height * 0.25 : tb.y + tb.height * 0.75
      return { x: tb.x + tb.width / 2, y }
    })
  }

  /**
   * Déplace une carte à la fin d'une colonne cible (dépôt sous sa dernière
   * carte). La colonne cible doit contenir au moins une carte.
   *
   * On relâche dans la marge basse de la dernière carte (hors de la carte
   * elle-même) : SortableJS détecte alors un dépôt « après le dernier élément »
   * et ajoute en fin. Relâcher SUR la carte rend l'index dépendant de la
   * trajectoire et de la taille de la fenêtre (échec observé en CI).
   * @param sourceTitle Carte à déplacer
   * @param columnName Colonne de destination
   */
  async dragTaskToColumnEnd(sourceTitle: string, columnName: string) {
    await this.performDrag(sourceTitle, async () => {
      const last = this.column(columnName).getByTestId('task-card').last()
      const lb = await last.boundingBox()
      if (!lb) throw new Error(`Colonne "${columnName}" sans carte pour servir de cible de dépôt`)

      return { x: lb.x + lb.width / 2, y: lb.y + lb.height + 4 }
    })
  }
}
