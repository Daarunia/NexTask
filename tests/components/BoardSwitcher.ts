import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet du sélecteur de tableau de l'en-tête (BoardSwitcher), affiché sur la
 * page du tableau seulement. Le bouton porte le tableau affiché, la liste
 * ouverte une ligne par tableau dans leur ordre.
 */
export class BoardSwitcher {
  readonly page: Page
  readonly button: Locator
  readonly currentName: Locator
  readonly menu: Locator
  readonly rows: Locator

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
  }

  /**
   * Ligne d'un tableau dans la liste ouverte.
   * @param name Nom exact du tableau
   */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('board-row-name').getByText(name, { exact: true }) })
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
}
