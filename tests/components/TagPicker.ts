import { Page, Locator, expect } from '@playwright/test'

/**
 * Motif qui repère un nom de tag dans le texte d'un élément, en respectant la
 * casse et sans accepter un nom plus long (« bug » ne matche pas « bugfix »).
 * Tolère le texte voisin d'une ligne ou d'une chip (bouton ×, bouton « … »).
 * @param name Nom exact du tag
 */
function tagNamePattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![A-Za-zÀ-ÿ0-9_-])${escaped}(?![A-Za-zÀ-ÿ0-9_-])`)
}

/**
 * Objet page du sélecteur de tags façon Notion (TagSelect) dans l'écran de
 * tâche.
 *
 * Couvre le champ fermé du TaskDialog, la vue liste du popover (recherche,
 * sélection, création, retrait, clavier) et la vue édition d'un tag (nom,
 * compteur, couleurs, suppression, retour). Le ciblage repose uniquement sur
 * le contrat de test de la spec (`.claude/tags.md`, section 6).
 */
export class TagPicker {
  readonly page: Page

  // Champ fermé dans le TaskDialog
  readonly field: Locator
  readonly fieldChips: Locator

  // Vue liste du popover
  readonly panel: Locator
  readonly search: Locator
  readonly panelChips: Locator
  readonly options: Locator
  readonly highlightedOptions: Locator
  readonly createOption: Locator

  // Vue édition d'un tag
  readonly editName: Locator
  readonly editError: Locator
  readonly editCount: Locator
  readonly editColors: Locator
  readonly selectedColor: Locator
  readonly editDelete: Locator
  readonly deleteConfirm: Locator
  readonly deleteCancel: Locator
  readonly editBack: Locator

  // Zone neutre du dialogue, cliquée pour refermer le popover
  private readonly outside: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page

    this.field = page.getByTestId('task-tags-field')
    this.fieldChips = this.field.getByTestId('task-tag-chip')

    // Le popover peut être téléporté hors du dialogue : ciblage depuis la page
    this.panel = page.getByTestId('tag-select-panel')
    this.search = this.panel.getByTestId('tag-select-search')
    this.panelChips = this.panel.getByTestId('task-tag-chip')
    this.options = this.panel.getByTestId('tag-option')
    this.highlightedOptions = this.panel.locator('[data-testid="tag-option"][data-highlighted="true"]')
    this.createOption = this.panel.getByTestId('tag-create-option')

    this.editName = this.panel.getByTestId('tag-edit-name')
    this.editError = this.panel.getByTestId('tag-edit-error')
    this.editCount = this.panel.getByTestId('tag-edit-count')
    this.editColors = this.panel.getByTestId('tag-edit-color')
    this.selectedColor = this.panel.locator('[data-testid="tag-edit-color"][data-selected="true"]')
    this.editDelete = this.panel.getByTestId('tag-edit-delete')
    this.deleteConfirm = this.panel.getByTestId('tag-delete-confirm')
    this.deleteCancel = this.panel.getByTestId('tag-delete-cancel')
    this.editBack = this.panel.getByTestId('tag-edit-back')

    this.outside = page.getByTestId('task-title-input')
  }

  /**
   * Chip sélectionnée du champ fermé, repérée par le nom du tag.
   * @param name Nom exact du tag
   */
  fieldChip(name: string): Locator {
    return this.fieldChips.filter({ hasText: tagNamePattern(name) })
  }

  /**
   * Chip sélectionnée en haut du popover, repérée par le nom du tag.
   * @param name Nom exact du tag
   */
  panelChip(name: string): Locator {
    return this.panelChips.filter({ hasText: tagNamePattern(name) })
  }

  /**
   * Toute chip sélectionnée portant ce nom, champ fermé et popover confondus.
   * @param name Nom exact du tag
   */
  anyChip(name: string): Locator {
    return this.page.getByTestId('task-tag-chip').filter({ hasText: tagNamePattern(name) })
  }

  /**
   * Ligne d'un tag existant dans la liste du popover.
   * @param name Nom exact du tag
   */
  option(name: string): Locator {
    return this.options.filter({ hasText: tagNamePattern(name) })
  }

  /**
   * Ligne d'une couleur dans la vue édition.
   * @param color Nom de la couleur dans la palette (ex : "rose")
   */
  color(color: string): Locator {
    return this.panel.locator(`[data-testid="tag-edit-color"][data-color="${color}"]`)
  }

  /** Ouvre le popover depuis le champ fermé du TaskDialog. */
  async open() {
    await this.field.click()
    await expect(this.panel).toBeVisible()
    await expect(this.search).toBeVisible()
  }

  /** Referme le popover par un clic en dehors, dans le dialogue. */
  async close() {
    await this.outside.click()
    await expect(this.panel).toBeHidden()
  }

  /** Referme le popover s'il est encore ouvert. */
  async closeIfOpen() {
    if (await this.panel.isVisible()) await this.close()
  }

  /**
   * Saisit un texte dans le champ de recherche (remplace la saisie en cours).
   * @param text Texte à saisir
   */
  async searchFor(text: string) {
    await this.search.fill(text)
  }

  /**
   * Ajoute un tag existant en cliquant sa ligne dans la liste.
   * @param name Nom exact du tag
   */
  async select(name: string) {
    await this.searchFor(name)
    await this.option(name).click()
    await expect(this.panelChip(name)).toBeVisible()
  }

  /**
   * Crée un tag à la volée via la ligne « Créer « xxx » ».
   * @param name Nom du tag à créer
   */
  async createWithOption(name: string) {
    await this.searchFor(name)
    await expect(this.createOption).toContainText(name)
    await this.createOption.click()
    await expect(this.panelChip(name)).toBeVisible()
  }

  /**
   * Crée (ou sélectionne) un tag en validant la saisie par Entrée.
   * @param name Nom saisi
   */
  async createWithEnter(name: string) {
    await this.searchFor(name)
    await this.search.press('Enter')
  }

  /**
   * Retire une chip sélectionnée via son bouton ×, en haut du popover.
   * @param name Nom exact du tag
   */
  async removeChip(name: string) {
    await this.panelChip(name).getByTestId('task-tag-chip-remove').click()
    await expect(this.panelChip(name)).toHaveCount(0)
  }

  /** Retire la dernière chip par Retour arrière sur un champ de recherche vide. */
  async removeLastWithBackspace() {
    await this.searchFor('')
    await this.search.press('Backspace')
  }

  /**
   * Index de la ligne de tag en surbrillance dans la liste (-1 si aucune).
   */
  async highlightedIndex(): Promise<number> {
    return this.options.evaluateAll((rows) => rows.findIndex((row) => row.getAttribute('data-highlighted') === 'true'))
  }

  /**
   * Ouvre le menu d'édition d'un tag via le bouton « … » de sa ligne (visible
   * au survol).
   * @param name Nom exact du tag
   */
  async openMenu(name: string) {
    await this.searchFor('')
    const row = this.option(name)
    await row.hover()
    await row.getByTestId('tag-option-menu').click()
    await expect(this.editName).toBeVisible()
  }

  /**
   * Renomme le tag ouvert dans la vue édition, validé par Entrée.
   * @param newName Nouveau nom
   */
  async rename(newName: string) {
    await this.editName.fill(newName)
    await this.editName.press('Enter')
  }

  /**
   * Applique une couleur au tag ouvert dans la vue édition.
   * @param color Nom de la couleur dans la palette
   */
  async setColor(color: string) {
    await this.color(color).click()
  }

  /** Supprime le tag ouvert dans la vue édition, confirmation comprise. */
  async deleteTag() {
    await this.editDelete.click()
    await expect(this.deleteConfirm).toBeVisible()
    await this.deleteConfirm.click()
  }

  /** Revient de la vue édition à la vue liste via le bouton « ← ». */
  async back() {
    await this.editBack.click()
    await expect(this.search).toBeVisible()
  }
}
