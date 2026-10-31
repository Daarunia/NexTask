import { Page, Locator, expect } from '@playwright/test'
import type { BoardColumnsMode } from '../../src/main/shared/board.constants'
import type { TagColor } from '../../src/main/shared/tag.constants'

/** Choix du dialogue de création d'un tableau, ceux non donnés restant à leur valeur de départ. */
export interface BoardCreateOptions {
  color?: TagColor | 'none'
  mode?: BoardColumnsMode
  copyFrom?: string // nom du tableau à copier, en mode copie
}

/**
 * Objet du sélecteur de tableau de l'en-tête (BoardSwitcher), affiché sur la
 * page du tableau seulement. Le bouton porte le tableau affiché, la liste
 * ouverte une ligne par tableau dans leur ordre, chacune avec sa poignée, son
 * bouton de sélection (qui reçoit le focus) et son menu ⋯, puis « Nouveau
 * tableau » qui ouvre le dialogue de création.
 */
export class BoardSwitcher {
  readonly page: Page
  readonly button: Locator
  readonly currentName: Locator
  readonly menu: Locator
  readonly rows: Locator
  readonly newBoardLink: Locator

  // Dialogue de création
  readonly createDialog: Locator
  readonly createName: Locator
  readonly createNameError: Locator
  readonly createConfirm: Locator
  readonly createCancel: Locator

  // Menu ⋯ d'une ligne, partagé par toutes les lignes
  readonly rowMenu: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page
    this.button = page.getByTestId('board-switcher')
    this.currentName = this.button.getByTestId('board-switcher-name')
    this.menu = page.getByTestId('board-switcher-menu')
    this.rows = this.menu.getByTestId('board-row')
    this.newBoardLink = this.menu.getByTestId('board-new')

    this.createDialog = page.getByTestId('board-create-dialog')
    this.createName = this.createDialog.getByTestId('board-create-name')
    this.createNameError = this.createDialog.getByTestId('board-create-name-error')
    this.createConfirm = this.createDialog.getByTestId('btn-board-create-confirm')
    this.createCancel = this.createDialog.getByTestId('btn-board-create-cancel')

    this.rowMenu = page.getByTestId('board-menu')
  }

  /**
   * Ligne d'un tableau dans la liste ouverte.
   * @param name Nom exact du tableau
   */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('board-row-name').getByText(name, { exact: true }) })
  }

  /**
   * Bouton de sélection de la ligne d'un tableau, celui qui reçoit le focus
   * et porte `aria-current` pour le tableau affiché.
   * @param name Nom exact du tableau
   */
  rowButton(name: string): Locator {
    return this.row(name).getByTestId('board-row-select')
  }

  /**
   * Ouvre la liste des tableaux, si elle ne l'est pas déjà.
   */
  async open() {
    // État du bouton plutôt que visibilité de la liste, encore affichée pendant sa fermeture animée
    if (await this.isOpen()) return
    await this.button.click()
    await expect(this.menu).toBeVisible()
  }

  /**
   * Vrai si la liste des tableaux est ouverte (ou en train de s'ouvrir).
   */
  async isOpen(): Promise<boolean> {
    return (await this.button.getAttribute('aria-expanded')) === 'true'
  }

  /**
   * Affiche un tableau depuis la liste, puis attend sa fermeture.
   * @param name Nom exact du tableau
   */
  async select(name: string) {
    await this.open()
    await this.row(name).click()
    await expect(this.menu).toBeHidden()
    await this.expectCurrent(name)
  }

  /**
   * Vérifie le tableau affiché par le bouton, et dans la liste si elle est ouverte.
   * @param name Nom exact du tableau attendu
   */
  async expectCurrent(name: string) {
    await expect(this.currentName).toHaveText(name)
    if (await this.isOpen()) {
      await expect(this.menu.locator('[aria-current="true"]').getByTestId('board-row-name')).toHaveText(name)
    }
  }

  /**
   * Noms des tableaux de la liste, dans l'ordre affiché (liste ouverte au besoin).
   */
  async names(): Promise<string[]> {
    await this.open()
    return this.rows.getByTestId('board-row-name').allTextContents()
  }

  /**
   * Ouvre le dialogue de création par « Nouveau tableau ».
   */
  async openCreate() {
    await this.open()
    await this.newBoardLink.click()
    await expect(this.createDialog).toBeVisible()
    await expect(this.createName).toBeFocused()
  }

  /**
   * Pastille de couleur du dialogue de création.
   * @param color Couleur de la palette, `none` sans couleur
   */
  createColor(color: TagColor | 'none'): Locator {
    return this.createDialog.locator(`[data-testid="board-create-color"][data-color="${color}"]`)
  }

  /**
   * Choix des colonnes de départ du dialogue de création.
   * @param mode Mode des colonnes
   */
  createMode(mode: BoardColumnsMode): Locator {
    return this.createDialog.locator(`[data-testid="board-create-mode"][data-mode="${mode}"]`)
  }

  /**
   * Remplit le dialogue de création déjà ouvert, sans le valider.
   * @param name Nom saisi
   * @param options Couleur, colonnes et tableau à copier
   */
  async fillCreate(name: string, options: BoardCreateOptions = {}) {
    await this.createName.fill(name)
    if (options.color) await this.createColor(options.color).click()
    if (options.mode) await this.createMode(options.mode).click()
    if (options.copyFrom) {
      await this.createDialog.getByTestId('board-create-copy-from').click()
      await this.page.getByRole('option', { name: options.copyFrom, exact: true }).click()
    }
  }

  /**
   * Crée un tableau par le dialogue, puis attend qu'il soit le tableau affiché.
   * @param name Nom du tableau
   * @param options Couleur, colonnes et tableau à copier
   */
  async create(name: string, options: BoardCreateOptions = {}) {
    await this.openCreate()
    await this.fillCreate(name, options)
    await this.createConfirm.click()
    await expect(this.createDialog).toBeHidden()
    await this.expectCurrent(name)
  }

  /**
   * Ouvre le menu ⋯ de la ligne d'un tableau (liste ouverte au besoin).
   * @param name Nom exact du tableau
   */
  async openRowMenu(name: string) {
    await this.open()
    await this.row(name).hover()
    await this.row(name).getByTestId('board-row-menu').click()
    await expect(this.rowMenu).toBeVisible()
  }

  /**
   * Entrée du menu ⋯ ouvert, sous-menu compris.
   * @param name Libellé exact
   */
  rowMenuItem(name: string): Locator {
    return this.rowMenu.getByRole('menuitem', { name, exact: true })
  }

  /**
   * Champ de renommage en place d'une ligne.
   */
  get renameInput(): Locator {
    return this.menu.getByTestId('board-row-rename')
  }

  /**
   * Passe la ligne d'un tableau en renommage par son menu ⋯.
   * @param name Nom exact du tableau
   */
  async startRename(name: string) {
    await this.openRowMenu(name)
    await this.rowMenuItem('Renommer').click()
    await expect(this.renameInput).toBeFocused()
  }

  /**
   * Glisse la ligne d'un tableau par sa poignée au-dessus d'une autre
   * (SortableJS en mode fallback, cf. ChecklistsPage.dragBefore).
   * @param name Tableau déplacé
   * @param targetName Tableau de référence, le déplacé se pose avant lui
   */
  async dragBefore(name: string, targetName: string) {
    await this.open()
    const grip = this.row(name).getByTestId('board-row-grip')
    const target = this.row(targetName)
    // Poignée visible au survol seulement
    await this.row(name).hover()
    const gb = await grip.boundingBox()
    const tb = await target.boundingBox()
    if (!gb || !tb) throw new Error('Ligne introuvable pour le glisser-déposer')

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
}
