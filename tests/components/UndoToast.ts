import { Page, Locator, expect } from '@playwright/test'

/**
 * Objet du toast « Annuler » affiché après une action annulable (archivage
 * d'une tâche, suppression définitive d'une tâche archivée).
 */
export class UndoToast {
  readonly page: Page
  readonly toasts: Locator
  readonly undoButton: Locator

  // Durée d'affichage du toast (5 s) avec une marge pour sa disparition animée
  static readonly HIDE_TIMEOUT = 10000

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page
    this.toasts = page.getByTestId('undo-toast')
    this.undoButton = this.toasts.getByTestId('btn-undo')
  }

  /**
   * Toast d'une action, repéré par la précision affichée (ex. titre de la tâche).
   * @param detail Précision exacte du toast
   */
  toast(detail: string): Locator {
    return this.toasts.filter({ has: this.page.getByTestId('undo-toast-detail').getByText(detail, { exact: true }) })
  }

  /**
   * Annule l'action d'un toast.
   * @param detail Précision exacte du toast
   */
  async undo(detail: string) {
    await this.toast(detail).getByTestId('btn-undo').click()
  }

  /**
   * Attend la fermeture d'un toast laissé sans réponse (l'action devient définitive).
   * @param detail Précision exacte du toast
   */
  async waitForExpiry(detail: string) {
    await expect(this.toast(detail)).toHaveCount(0, { timeout: UndoToast.HIDE_TIMEOUT })
  }
}
