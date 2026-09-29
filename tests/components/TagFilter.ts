import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet page du filtre du Kanban par tag (MultiSelect au-dessus du tableau).
 *
 * Couvre l'ouverture de la liste, le cochage / décochage d'un tag, la
 * fermeture par Échap, la lecture des tags proposés et les deux messages liés
 * au filtre. Le ciblage repose uniquement sur le contrat de test de la spec
 * (`.claude/tags.md`, section 6, « Filtre ») et sur les rôles ARIA standards
 * de la liste (`listbox`, `option`, `aria-selected`).
 */
export class TagFilter {
  readonly page: Page

  // Racine du MultiSelect, un clic ouvre la liste
  readonly root: Locator
  // Liste ouverte (téléportée hors de la racine) et ses options
  readonly list: Locator
  readonly options: Locator
  // « Déplacement désactivé pendant le filtrage », présent si le filtre est actif
  readonly dndHint: Locator
  // « Aucune tâche ne correspond au filtre »
  readonly emptyMessage: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page

    this.root = page.getByTestId('tag-filter')
    this.list = page.getByRole('listbox')
    this.options = this.list.getByRole('option')
    this.dndHint = page.getByTestId('filter-dnd-hint')
    this.emptyMessage = page.getByTestId('filter-empty')
  }

  /**
   * Option d'un tag dans la liste ouverte, repérée par son nom accessible.
   * @param name Nom exact du tag
   */
  option(name: string): Locator {
    return this.page.getByRole('option', { name, exact: true })
  }

  /** Ouvre la liste des tags si elle ne l'est pas déjà. */
  async open() {
    if (await this.list.isVisible()) return

    // Clic près du bord droit (flèche de la liste) : le centre peut tomber sur
    // le × d'une chip sélectionnée, qui retirerait le tag au lieu d'ouvrir
    const box = await this.root.boundingBox()
    if (!box) throw new Error('Filtre par tag introuvable')
    await this.root.click({ position: { x: box.width - 10, y: box.height / 2 } })
    await expect(this.list).toBeVisible()
  }

  /** Referme la liste par Échap. */
  async close() {
    await this.page.keyboard.press('Escape')
    await expect(this.list).toBeHidden()
  }

  /**
   * Noms des tags proposés dans la liste ouverte, triés sans tenir compte de
   * la casse. La ligne « aucune option » d'une liste vide n'a pas de nom de
   * tag et n'est pas comptée.
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
   * Vérifie qu'un tag proposé est coché (liste ouverte au préalable).
   * @param name Nom exact du tag
   */
  async expectSelected(name: string) {
    await expect(this.option(name)).toHaveAttribute('aria-selected', 'true')
  }

  /**
   * Coche ou décoche un tag dans la liste ouverte et attend le nouvel état.
   * @param name Nom exact du tag
   * @param selected État attendu après le clic
   */
  private async toggle(name: string, selected: boolean) {
    const option = this.option(name)
    await expect(option).toHaveAttribute('aria-selected', String(!selected))
    await option.click()
    await expect(option).toHaveAttribute('aria-selected', String(selected))
  }

  /**
   * Coche un ou plusieurs tags puis referme la liste.
   * @param names Noms exacts des tags à cocher
   */
  async select(...names: string[]) {
    await this.open()
    for (const name of names) await this.toggle(name, true)
    await this.close()
  }

  /**
   * Décoche un ou plusieurs tags puis referme la liste.
   * @param names Noms exacts des tags à décocher
   */
  async unselect(...names: string[]) {
    await this.open()
    for (const name of names) await this.toggle(name, false)
    await this.close()
  }
}
