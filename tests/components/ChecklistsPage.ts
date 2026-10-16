import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet de la page Checklists (modèles de checklist en deux volets)
 */
export class ChecklistsPage {
  /**
   * Attributs
   */
  readonly page: Page
  readonly root: Locator
  readonly newButton: Locator
  readonly createFirstButton: Locator
  readonly empty: Locator
  readonly noSelection: Locator
  readonly search: Locator
  readonly noMatch: Locator
  readonly rows: Locator
  readonly editor: Locator
  readonly nameInput: Locator
  readonly nameError: Locator
  readonly saveStatus: Locator
  readonly itemCount: Locator
  readonly items: Locator
  readonly itemInputs: Locator
  readonly newItem: Locator
  readonly menuButton: Locator

  /**
   * Constructeur
   *
   * @param page Current page
   */
  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('checklists-page')
    this.newButton = this.root.getByTestId('btn-new-template')
    this.createFirstButton = this.root.getByTestId('btn-create-first-template')
    this.empty = this.root.getByTestId('checklists-empty')
    this.noSelection = this.root.getByTestId('template-no-selection')
    this.search = this.root.getByTestId('template-search')
    this.noMatch = this.root.getByTestId('template-no-match')
    this.rows = this.root.getByTestId('template-row')
    this.editor = this.root.getByTestId('template-editor')
    this.nameInput = this.editor.getByTestId('template-name-input')
    this.nameError = this.editor.getByTestId('template-name-error')
    this.saveStatus = this.editor.getByTestId('template-save-status')
    this.itemCount = this.editor.getByTestId('template-item-count')
    this.items = this.editor.getByTestId('checklist-item')
    this.itemInputs = this.editor.getByTestId('checklist-item-input')
    this.newItem = this.editor.getByTestId('checklist-new-item')
    this.menuButton = this.editor.getByTestId('btn-template-menu')
  }

  /**
   * Ligne d'un modèle dans le volet gauche, repérée par son nom exact.
   * @param name Nom exact du modèle
   */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('template-name').getByText(name, { exact: true }) })
  }

  /**
   * Noms des modèles affichés, dans l'ordre de la liste (haut → bas).
   */
  async names(): Promise<string[]> {
    return (await this.rows.getByTestId('template-name').allInnerTexts()).map((name) => name.trim())
  }

  /**
   * Textes des points du modèle ouvert, dans l'ordre.
   */
  async itemTexts(): Promise<string[]> {
    const texts: string[] = []
    for (const input of await this.itemInputs.all()) texts.push(await input.inputValue())
    return texts
  }

  /**
   * Sélectionne un modèle dans la liste.
   * @param name Nom exact du modèle
   */
  async select(name: string) {
    await this.row(name).click()
    await expect(this.nameInput).toHaveValue(name)
  }

  /**
   * Ajoute des points au modèle ouvert, au clavier, par le champ « Ajouter un point ».
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
   * Choisit une action du menu ⋯ du modèle ouvert.
   * @param label Libellé exact de l'action (« Dupliquer », « Supprimer »)
   */
  async menuAction(label: string) {
    await this.menuButton.click()
    await this.page.getByTestId('template-menu').getByRole('menuitem', { name: label, exact: true }).click()
  }

  /**
   * Supprime le modèle ouvert, confirmation acceptée.
   */
  async deleteSelected() {
    await this.menuAction('Supprimer')
    await this.page.getByTestId('btn-confirm-accept').click()
  }

  /**
   * Attend la fin de l'enregistrement automatique (indicateur « Enregistré »).
   */
  async expectSaved() {
    await expect(this.saveStatus).toHaveAttribute('data-status', 'saved')
    await expect(this.saveStatus).toHaveText('Enregistré')
  }

  /**
   * Glisse un élément par sa poignée au-dessus d'un autre (SortableJS en mode
   * fallback, cf. TaskBoard.dragStageBefore).
   * @param grip Poignée de l'élément déplacé
   * @param target Élément de référence, le déplacé se pose avant lui
   */
  async dragBefore(grip: Locator, target: Locator) {
    await grip.scrollIntoViewIfNeeded()
    // Poignée visible au survol seulement
    await grip.hover()
    const gb = await grip.boundingBox()
    const tb = await target.boundingBox()
    if (!gb || !tb) throw new Error('Élément introuvable pour le glisser-déposer')

    const grabX = gb.x + gb.width / 2
    const grabY = gb.y + gb.height / 2
    const dropY = tb.y + tb.height / 4

    await this.page.mouse.move(grabX, grabY)
    await this.page.mouse.down()
    // Amorce verticale (> fallbackTolerance)
    await this.page.mouse.move(grabX, grabY - 8, { steps: 6 })
    await this.page.mouse.move(grabX, dropY, { steps: 25 })
    await this.page.mouse.move(grabX, dropY, { steps: 5 })
    await this.page.mouse.up()
  }

  async expectVisible() {
    await expect(this.root).toBeVisible()
  }
}
