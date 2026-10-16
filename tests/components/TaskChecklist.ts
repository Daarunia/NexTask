import { Page, Locator, expect } from '@playwright/test'
import { TaskBoard } from './TaskBoard'

/**
 * Objet de la section Checklist du dialogue de tâche (TaskChecklist.vue).
 *
 * Saisie des points, coches, popover « Depuis un modèle », menu ⋯ et dialogue
 * « Enregistrer comme modèle ». Les popovers ne s'ouvrent qu'une fois le zoom
 * d'ouverture du dialogue terminé (cf. TaskBoard.waitForDialogOpened).
 */
export class TaskChecklist {
  readonly page: Page
  readonly root: Locator
  readonly progress: Locator
  readonly bar: Locator
  readonly items: Locator
  readonly itemInputs: Locator
  readonly itemChecks: Locator
  readonly newItem: Locator
  readonly error: Locator
  readonly hiddenNote: Locator
  readonly showCheckedButton: Locator

  // Popover « Depuis un modèle »
  readonly fromTemplateButton: Locator
  readonly templates: Locator
  readonly templateOptions: Locator
  readonly templateSearch: Locator
  readonly templatesEmpty: Locator
  readonly manageTemplatesLink: Locator

  // Menu ⋯
  readonly menuButton: Locator
  readonly menu: Locator

  // Dialogue « Enregistrer comme modèle »
  readonly saveDialog: Locator
  readonly saveNameInput: Locator
  readonly saveNameError: Locator
  readonly saveHint: Locator
  readonly saveConfirmButton: Locator
  readonly saveCancelButton: Locator

  // Toast d'un modèle créé
  readonly toast: Locator
  readonly toastOpenButton: Locator

  private readonly board: TaskBoard

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page
    this.board = new TaskBoard(page)
    this.root = page.getByTestId('task-checklist')
    this.progress = this.root.getByTestId('task-checklist-progress')
    this.bar = this.root.getByTestId('task-checklist-bar')
    this.items = this.root.getByTestId('checklist-item')
    this.itemInputs = this.root.getByTestId('checklist-item-input')
    this.itemChecks = this.root.getByTestId('checklist-item-check')
    this.newItem = this.root.getByTestId('checklist-new-item')
    this.error = this.root.getByTestId('task-checklist-error')
    this.hiddenNote = this.root.getByTestId('task-checklist-hidden-note')
    this.showCheckedButton = this.hiddenNote.getByRole('button')

    this.fromTemplateButton = this.root.getByTestId('btn-checklist-from-template')
    this.templates = page.getByTestId('checklist-templates')
    this.templateOptions = this.templates.getByTestId('checklist-template-option')
    this.templateSearch = this.templates.getByTestId('checklist-template-search')
    this.templatesEmpty = this.templates.getByTestId('checklist-templates-empty')
    this.manageTemplatesLink = this.templates.getByTestId('btn-manage-templates')

    this.menuButton = this.root.getByTestId('btn-checklist-menu')
    this.menu = page.getByTestId('checklist-menu')

    this.saveDialog = page.getByTestId('save-template-dialog')
    this.saveNameInput = this.saveDialog.getByTestId('save-template-name')
    this.saveNameError = this.saveDialog.getByTestId('save-template-name-error')
    this.saveHint = this.saveDialog.getByTestId('save-template-hint')
    this.saveConfirmButton = this.saveDialog.getByTestId('btn-save-template-confirm')
    this.saveCancelButton = this.saveDialog.getByTestId('btn-save-template-cancel')

    this.toast = page.getByTestId('action-toast')
    this.toastOpenButton = this.toast.getByTestId('btn-toast-action')
  }

  /**
   * Textes des points, dans l'ordre (points masqués compris).
   */
  async itemTexts(): Promise<string[]> {
    const texts: string[] = []
    for (const input of await this.itemInputs.all()) texts.push(await input.inputValue())
    return texts
  }

  /**
   * États cochés des points, dans l'ordre.
   */
  async checkedStates(): Promise<boolean[]> {
    return this.items.evaluateAll((nodes) => nodes.map((node) => node.classList.contains('checked')))
  }

  /**
   * Rang d'un point repéré par son texte exact.
   * @param text Texte du point
   */
  async indexOf(text: string): Promise<number> {
    const index = (await this.itemTexts()).indexOf(text)
    if (index === -1) throw new Error(`Point introuvable : "${text}"`)
    return index
  }

  /**
   * Point repéré par son texte exact.
   * @param text Texte du point
   */
  async item(text: string): Promise<Locator> {
    return this.items.nth(await this.indexOf(text))
  }

  /**
   * Ajoute des points au clavier, par le champ « Ajouter un point ».
   * @param texts Textes des points, dans l'ordre
   */
  async addItems(...texts: string[]) {
    await this.newItem.click()
    for (const text of texts) {
      await this.newItem.fill(text)
      await this.newItem.press('Enter')
    }
  }

  /**
   * Coche ou décoche un point par sa case.
   * @param text Texte du point
   */
  async toggle(text: string) {
    await this.itemChecks.nth(await this.indexOf(text)).click()
  }

  /**
   * Ouvre le popover « Depuis un modèle », une fois le dialogue immobile.
   */
  async openTemplates() {
    await this.board.waitForDialogOpened()
    await this.scrollIntoView(this.fromTemplateButton)
    await this.fromTemplateButton.click()
    await expect(this.templates).toBeVisible()
  }

  /**
   * Amène un bouton en vue avant de cliquer dessus. Le dialogue défile alors,
   * mais l'événement de défilement n'arrive qu'à la frame suivante. Laissé au
   * clic, il tomberait une fois le popover ouvert, que PrimeVue refermerait
   * aussitôt (cf. TaskBoard.waitForDialogOpened).
   * @param button Bouton à amener en vue
   */
  private async scrollIntoView(button: Locator) {
    await button.scrollIntoViewIfNeeded()
    await this.page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }

  /**
   * Option d'un modèle dans le popover, repérée par son nom exact.
   * @param name Nom du modèle
   */
  templateOption(name: string): Locator {
    return this.templateOptions.filter({
      has: this.page.getByTestId('checklist-template-name').getByText(name, { exact: true }),
    })
  }

  /**
   * Noms des modèles proposés, dans l'ordre.
   */
  async templateNames(): Promise<string[]> {
    return (await this.templates.getByTestId('checklist-template-name').allInnerTexts()).map((name) => name.trim())
  }

  /**
   * Applique un modèle depuis le popover.
   * @param name Nom du modèle
   */
  async applyTemplate(name: string) {
    await this.openTemplates()
    await this.templateOption(name).click()
    await expect(this.templates).toBeHidden()
  }

  /**
   * Ouvre le menu ⋯ de la checklist, une fois le dialogue immobile.
   */
  async openMenu() {
    await this.board.waitForDialogOpened()
    await this.scrollIntoView(this.menuButton)
    await this.menuButton.click()
    await expect(this.menu).toBeVisible()
  }

  /**
   * Entrée du menu ⋯, repérée par son libellé exact.
   * @param label Libellé de l'action
   */
  menuItem(label: string): Locator {
    return this.menu.getByRole('menuitem', { name: label, exact: true })
  }

  /**
   * Choisit une action du menu ⋯.
   * @param label Libellé exact de l'action (« Tout cocher », « Vider la checklist »…)
   */
  async menuAction(label: string) {
    await this.openMenu()
    await this.menuItem(label).click()
    await expect(this.menu).toBeHidden()
  }

  /**
   * Glisse un point par sa poignée juste avant un autre (SortableJS en mode
   * fallback, cf. ChecklistsPage.dragBefore).
   * @param sourceText Texte du point déplacé
   * @param targetText Texte du point de référence
   */
  async dragBefore(sourceText: string, targetText: string) {
    const grip = (await this.item(sourceText)).getByTestId('checklist-item-grip')
    const target = await this.item(targetText)
    await grip.scrollIntoViewIfNeeded()
    await grip.hover()
    const gb = await grip.boundingBox()
    const tb = await target.boundingBox()
    if (!gb || !tb) throw new Error('Point introuvable pour le glisser-déposer')

    const grabX = gb.x + gb.width / 2
    const grabY = gb.y + gb.height / 2
    const dropY = tb.y + tb.height / 4

    await this.page.mouse.move(grabX, grabY)
    await this.page.mouse.down()
    await this.page.mouse.move(grabX, grabY - 8, { steps: 6 })
    await this.page.mouse.move(grabX, dropY, { steps: 25 })
    await this.page.mouse.move(grabX, dropY, { steps: 5 })
    await this.page.mouse.up()
  }
}
