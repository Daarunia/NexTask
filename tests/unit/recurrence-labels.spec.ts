import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { RecurrenceSummary } from '../../src/main/shared/recurrence.constants'
import { i18n } from '../../src/renderer/i18n'
import {
  describeRecurrence,
  formatNextRun,
  monthlyDayLabel,
  ordinalDay,
  ordinalRank,
  recurrencePresetOptions,
  weekdayLetter,
  weekdayName,
} from '../../src/renderer/utils/recurrence.helper'

/**
 * Tests unitaires des libellés des tâches récurrentes selon la langue de
 * l'interface. Le français est déjà couvert par recurrence.spec.ts : ici, les
 * mêmes résumés en anglais, et quelques cas croisés pour vérifier que la
 * langue active est bien suivie.
 */

/**
 * Date en heure locale (Europe/Paris, cf. vitest.config.ts), mois de 1 à 12.
 * @param year Année
 * @param month Mois (1 à 12)
 * @param day Jour
 * @param hours Heures
 */
function local(year: number, month: number, day: number, hours = 9): Date {
  return new Date(year, month - 1, day, hours, 0)
}

/**
 * Série mensuelle commençant le jeudi 15 octobre 2026 à 09:00.
 * @param overrides Champs remplacés
 */
function summary(overrides: Partial<RecurrenceSummary> = {}): RecurrenceSummary {
  return {
    id: 1,
    anchor: 'schedule',
    frequency: 'monthly',
    interval: 1,
    weekdays: null,
    monthlyMode: 'nthWeekday',
    time: '09:00',
    startsAt: local(2026, 10, 15).toISOString(),
    endType: 'never',
    endsOn: null,
    maxCount: null,
    generatedCount: 1,
    skipIfPending: true,
    leadDays: 0,
    status: 'active',
    nextRunAt: null,
    ...overrides,
  }
}

describe('Libellés en anglais', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en'
  })

  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  test('ordinaux anglais', () => {
    expect([1, 2, 3, 4].map((rank) => ordinalRank(rank))).toEqual(['1st', '2nd', '3rd', '4th'])
    expect(ordinalDay(1)).toBe('1st')
  })

  test('jours de la semaine', () => {
    expect(weekdayName(1)).toBe('Monday')
    expect(weekdayLetter(4)).toBe('T')
  })

  test('jour du mois déduit de la date de début', () => {
    expect(monthlyDayLabel('dayOfMonth', local(2026, 10, 15))).toBe('on the 15th')
    expect(monthlyDayLabel('nthWeekday', local(2026, 10, 15))).toBe('on the 3rd Thursday')
    expect(monthlyDayLabel('nthWeekday', local(2026, 10, 29))).toBe('on the last Thursday')
    expect(monthlyDayLabel('lastDay', local(2026, 10, 15))).toBe('on the last day')
  })

  test('résumés selon le calendrier', () => {
    expect(describeRecurrence(summary())).toBe('Every month on the 3rd Thursday at 09:00')
    expect(describeRecurrence(summary({ frequency: 'daily', interval: 2 }))).toBe('Every 2 days at 09:00')
    expect(describeRecurrence(summary({ frequency: 'weekly', weekdays: '1,2,3,4,5' }))).toBe('Every weekday at 09:00')
    expect(describeRecurrence(summary({ frequency: 'weekly', interval: 2, weekdays: '1,4' }))).toBe(
      'Every 2 weeks on Monday and Thursday at 09:00',
    )
    expect(describeRecurrence(summary({ frequency: 'yearly' }))).toBe('Every year on October 15 at 09:00')
  })

  test('fin de série et création anticipée', () => {
    expect(describeRecurrence(summary({ endType: 'afterCount', maxCount: 1, leadDays: 1 }))).toBe(
      'Every month on the 3rd Thursday at 09:00, 1 time, created 1 day early',
    )
    expect(describeRecurrence(summary({ endType: 'afterCount', maxCount: 6, leadDays: 2 }))).toBe(
      'Every month on the 3rd Thursday at 09:00, 6 times, created 2 days early',
    )
    expect(describeRecurrence(summary({ endType: 'onDate', endsOn: local(2026, 12, 31).toISOString() }))).toBe(
      'Every month on the 3rd Thursday at 09:00, until Dec 31, 2026',
    )
  })

  test('après archivage', () => {
    expect(describeRecurrence(summary({ anchor: 'completion', frequency: 'daily', interval: 3 }))).toBe(
      '3 days after the previous one is archived, at 09:00',
    )
  })

  test('prochaine date et préréglages', () => {
    expect(formatNextRun(local(2026, 10, 22))).toBe('Thu, Oct 22 09:00')
    expect(recurrencePresetOptions(local(2026, 10, 1)).map((option) => option.label)).toEqual([
      'Does not repeat',
      'Every day',
      'Every weekday (Mon–Fri)',
      'Every week on Thursday',
      'Every month on the 1st',
      'Every year on October 1',
      'Custom…',
    ])
  })
})

describe('Libellés en français', () => {
  test('préréglages', () => {
    expect(recurrencePresetOptions(local(2026, 10, 1)).map((option) => option.label)).toEqual([
      'Ne pas répéter',
      'Tous les jours',
      'Tous les jours ouvrés (lun–ven)',
      'Toutes les semaines le jeudi',
      'Tous les mois le 1er',
      'Tous les ans le 1er octobre',
      'Personnaliser…',
    ])
    expect(formatNextRun(local(2026, 10, 1))).toBe('jeu. 1er oct. 09:00')
  })

  test('jours de plusieurs semaines énumérés', () => {
    expect(describeRecurrence(summary({ frequency: 'weekly', interval: 2, weekdays: '1,4' }))).toBe(
      'Toutes les 2 semaines le lundi et le jeudi à 09:00',
    )
  })
})
