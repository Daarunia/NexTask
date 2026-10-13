import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet page de la barre de recherche du board (en-tête) : filtre par texte
 * et par tags.
 *
 * Les tags se choisissent en tapant `#` puis leur nom, et s'affichent en chips
 * dans la barre. Le ciblage repose sur les `data-testid` de la barre et sur
 * les rôles ARIA de la liste de suggestions (`combobox`, `listbox`, `option`).
 */
export class TagFilter {
  readonly page: Page

  // Barre entière, champ de saisie et liste de suggestions
  readonly root: Locator
  readonly input: Locator
  readonly list: Locator
  // Suggestions de tags et de tâches, et l'option « Rechercher … »
  readonly options: Locator
  readonly taskOptions: Locator
  readonly textOption: Locator
  // Chips des tags du filtre
  readonly chips: Locator
  readonly clearButton: Locator
  // Icône « déplacement désactivé », présente si le filtre est actif
  readonly dndHint: Locator
  // « Aucune tâche ne correspond au filtre »
  readonly emptyMessage: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page

    this.root = page.getByTestId('board-search')
    this.input = page.getByTestId('search-input')
    this.list = page.getByTestId('search-list')
    this.options = this.list.getByTestId('search-option-tag')
    this.taskOptions = this.list.getByTestId('search-option-task')
    this.textOption = this.list.getByTestId('search-option-text')
    this.chips = this.root.getByTestId('search-tag-chip')
    this.clearButton = page.getByTestId('search-clear')
    this.dndHint = page.getByTestId('filter-dnd-hint')
    this.emptyMessage = page.getByTestId('filter-empty')
  }

  /**
   * Suggestion d'un tag dans la liste ouverte, repérée par son nom accessible.
   * @param name Nom exact du tag
   */
  option(name: string): Locator {
    return this.list.getByRole('option', { name, exact: true }).and(this.options)
  }

  /**
   * Suggestion d'une tâche dans la liste ouverte.
   * @param title Titre exact de la tâche
   */
  taskOption(title: string): Locator {
    return this.list.getByRole('option', { name: title, exact: true }).and(this.taskOptions)
  }

  /**
   * Chip d'un tag du filtre.
   * @param name Nom exact du tag
   */
  chip(name: string): Locator {
    return this.chips.filter({ hasText: new RegExp(`^${name}$`) })
  }

  /** Ouvre la liste des tags proposés (saisie de `#`). */
  async open() {
    await this.input.fill('#')
    await expect(this.list).toBeVisible()
  }

  /** Referme la liste par Échap et vide la saisie. */
  async close() {
    await this.input.press('Escape')
    await expect(this.list).toBeHidden()
    await this.input.fill('')
  }

  /**
   * Saisit un texte de recherche (le board se filtre en direct).
   * @param text Texte saisi
   */
  async search(text: string) {
    await this.input.fill(text)
  }

  /**
   * Noms des tags proposés dans la liste ouverte, triés sans tenir compte de la casse.
   */
  async optionNames(): Promise<string[]> {
    const names = await this.options.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('aria-label')).filter((name): name is string => !!name),
    )
    return names.sort((a, b) => a.localeCompare(b))
  }

  /**
   * Vérifie la liste exacte des tags proposés (liste ouverte au préalable).
   * @param names Noms attendus, dans n'importe quel ordre
   */
  async expectOptions(names: string[]) {
    for (const name of names) await expect(this.option(name)).toBeVisible()
    await expect.poll(() => this.optionNames()).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  }

  /**
   * Vérifie qu'un tag fait partie du filtre (chip affichée).
   * @param name Nom exact du tag
   */
  async expectSelected(name: string) {
    await expect(this.chip(name)).toBeVisible()
  }

  /**
   * Vérifie la liste exacte des tags du filtre, dans l'ordre de sélection.
   * @param names Noms attendus
   */
  async expectChips(names: string[]) {
    await expect(this.chips).toHaveText(names)
  }

  /**
   * Ajoute un ou plusieurs tags au filtre via `#nom`.
   * @param names Noms exacts des tags
   */
  async select(...names: string[]) {
    for (const name of names) {
      await this.input.fill(`#${name}`)
      await this.option(name).click()
      await this.expectSelected(name)
    }
    await this.input.blur()
  }

  /**
   * Retire un ou plusieurs tags du filtre par le × de leur chip.
   * @param names Noms exacts des tags
   */
  async unselect(...names: string[]) {
    for (const name of names) {
      await this.chip(name).getByTestId('search-tag-chip-remove').click()
      await expect(this.chip(name)).toHaveCount(0)
    }
  }
}
