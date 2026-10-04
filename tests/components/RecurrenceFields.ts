import { Page, Locator, expect } from '@playwright/test'
import type { MonthlyMode } from '../../src/main/shared/recurrence.constants'

/**
 * Objet du champ « Répéter » de l'écran de tâche (RecurrenceFields, dans
 * TaskDialog) : préréglages, bloc « Personnaliser… » (point de départ des
 * dates, jour du mois en mensuel), résumé de la règle et prochaine date, case
 * « Appliquer aux prochaines occurrences ».
 */
export class RecurrenceFields {
  readonly page: Page
  readonly root: Locator
  readonly select: Locator
  readonly summary: Locator
  readonly next: Locator
  readonly monthEndHint: Locator
  readonly stopLink: Locator
  readonly stopHint: Locator
  readonly pausedHint: Locator
  readonly error: Locator

  // Bloc « Personnaliser… »
  readonly custom: Locator
  readonly anchorSchedule: Locator
  readonly anchorCompletion: Locator
  readonly interval: Locator
  readonly unit: Locator
  readonly weekdays: Locator
  readonly endNever: Locator
  readonly endOnDate: Locator
  readonly endAfterCount: Locator
  readonly endDate: Locator
  readonly endCount: Locator
  readonly skipIfPending: Locator
  readonly leadSameDay: Locator
  readonly leadBefore: Locator
  readonly leadDays: Locator

  // Case de l'écran de tâche, hors du champ
  readonly applyToSeries: Locator

  /**
   * Constructeur
   * @param page Page courante
   */
  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('recurrence-fields')
    this.select = this.root.getByTestId('recurrence-select')
    this.summary = this.root.getByTestId('recurrence-summary')
    this.next = this.root.getByTestId('recurrence-next')
    this.monthEndHint = this.root.getByTestId('recurrence-month-end-hint')
    this.stopLink = this.root.getByTestId('recurrence-stop')
    this.stopHint = this.root.getByTestId('recurrence-stop-hint')
    this.pausedHint = this.root.getByTestId('recurrence-paused-hint')
    this.error = this.root.getByTestId('recurrence-error')

    this.custom = this.root.getByTestId('recurrence-custom')
    // Point de départ : selon le calendrier, ou après l'archivage de la précédente
    this.anchorSchedule = this.custom.getByTestId('recurrence-anchor-schedule').locator('input')
    this.anchorCompletion = this.custom.getByTestId('recurrence-anchor-completion').locator('input')
    // Les composants PrimeVue exposent un <input> interne sous le data-testid
    this.interval = this.custom.getByTestId('recurrence-interval').locator('input')
    this.unit = this.custom.getByTestId('recurrence-unit')
    this.weekdays = this.custom.getByTestId('recurrence-weekday')
    this.endNever = this.custom.getByTestId('recurrence-end-never').locator('input')
    this.endOnDate = this.custom.getByTestId('recurrence-end-on-date').locator('input')
    this.endAfterCount = this.custom.getByTestId('recurrence-end-after-count').locator('input')
    this.endDate = this.custom.getByTestId('recurrence-end-date').locator('input')
    this.endCount = this.custom.getByTestId('recurrence-end-count').locator('input')
    this.skipIfPending = this.custom.getByTestId('recurrence-skip').locator('input')
    this.leadSameDay = this.custom.getByTestId('recurrence-lead-same-day').locator('input')
    this.leadBefore = this.custom.getByTestId('recurrence-lead-before').locator('input')
    this.leadDays = this.custom.getByTestId('recurrence-lead-days').locator('input')

    this.applyToSeries = page.getByTestId('task-apply-to-series').locator('input')
  }

  /**
   * Choisit une option du champ « Répéter » par son libellé.
   * @param label Libellé exact (ex. « Tous les jours », « Personnaliser… »)
   */
  async choose(label: string) {
    await this.select.click()
    await this.page.getByRole('option', { name: label, exact: true }).click()
    await expect(this.select).toHaveText(label)
  }

  /**
   * Bouton radio d'un mode du mensuel (bloc personnalisé).
   * @param mode `dayOfMonth`, `nthWeekday` ou `lastDay`
   */
  monthlyMode(mode: MonthlyMode): Locator {
    return this.custom.locator(`[data-testid="recurrence-monthly-mode"][data-mode="${mode}"]`).locator('input')
  }

  /**
   * Libellé d'un mode du mensuel, tiré de la date de début (ex. « le 3e jeudi »).
   * @param mode `dayOfMonth`, `nthWeekday` ou `lastDay`
   */
  monthlyLabel(mode: MonthlyMode): Locator {
    return this.custom.locator(`label[for="recurrence-monthly-${mode}"]`)
  }

  /**
   * Bouton d'un jour de la semaine (bloc personnalisé).
   * @param weekday Jour ISO (lundi = 1)
   */
  weekday(weekday: number): Locator {
    return this.custom.locator(`[data-testid="recurrence-weekday"][data-weekday="${weekday}"]`)
  }

  /**
   * Jours de la semaine sélectionnés, en jours ISO.
   */
  async selectedWeekdays(): Promise<number[]> {
    const days: number[] = []
    for (const button of await this.weekdays.all()) {
      if ((await button.getAttribute('aria-pressed')) === 'true') {
        days.push(Number(await button.getAttribute('data-weekday')))
      }
    }
    return days
  }

  /**
   * Sélectionne exactement ces jours de la semaine.
   * @param days Jours ISO (lundi = 1)
   */
  async setWeekdays(days: number[]) {
    for (let day = 1; day <= 7; day++) {
      const pressed = (await this.weekday(day).getAttribute('aria-pressed')) === 'true'
      if (pressed !== days.includes(day)) await this.weekday(day).click()
    }
    expect(await this.selectedWeekdays()).toEqual([...days].sort((a, b) => a - b))
  }

  /**
   * Saisit un nombre dans un InputNumber PrimeVue (saisie clavier : le
   * composant ignore un simple remplacement de la valeur).
   * @param input Champ interne de l'InputNumber
   * @param value Nombre à saisir
   */
  async typeNumber(input: Locator, value: number) {
    await input.click()
    await input.press('ControlOrMeta+a')
    await input.pressSequentially(String(value))
    await input.press('Tab')
    await expect(input).toHaveValue(String(value))
  }

  /**
   * Intervalle et unité de la règle personnalisée.
   * @param interval Intervalle (1 à 99)
   * @param unit Libellé de l'unité (ex. « semaines »)
   */
  async setEvery(interval: number, unit: string) {
    await this.typeNumber(this.interval, interval)
    await this.unit.click()
    await this.page.getByRole('option', { name: unit, exact: true }).click()
    await expect(this.unit).toHaveText(unit)
  }

  /**
   * Création anticipée « N jours avant ».
   * @param days Nombre de jours (1 à 30)
   */
  async createDaysBefore(days: number) {
    await this.leadBefore.check()
    await this.typeNumber(this.leadDays, days)
  }

  /**
   * Fin « après N occurrences ».
   * @param count Nombre d'occurrences
   */
  async endAfter(count: number) {
    await this.endAfterCount.check()
    await this.typeNumber(this.endCount, count)
  }
}
