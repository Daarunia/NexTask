import { afterEach, describe, expect, test } from 'vitest'
import { i18n } from '../../src/renderer/i18n'
import {
  dayLabel,
  dayOffset,
  dayState,
  longDateLabel,
  shortDateLabel,
  sortByStartDate,
} from '../../src/renderer/utils/date.helper'

/**
 * Tests unitaires des dates des cartes du tableau (date de début d'une
 * tâche), relatives au jour courant et dans la langue active.
 */

/**
 * Date en heure locale (Europe/Paris, cf. vitest.config.ts), mois de 1 à 12.
 * @param year Année
 * @param month Mois (1 à 12)
 * @param day Jour
 * @param hours Heures
 * @param minutes Minutes
 */
function local(year: number, month: number, day: number, hours = 9, minutes = 0): Date {
  return new Date(year, month - 1, day, hours, minutes)
}

// Jeudi 15 octobre 2026, 14 h 30
const NOW = local(2026, 10, 15, 14, 30)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('dayOffset', () => {
  test.each([
    [local(2026, 10, 15, 0), 0],
    [local(2026, 10, 15, 23, 59), 0],
    [local(2026, 10, 16, 0), 1],
    [local(2026, 10, 14, 23, 59), -1],
    [local(2026, 11, 15), 31],
  ])('%s → %i', (date, expected) => {
    expect(dayOffset(date, NOW)).toBe(expected)
  })

  test("le passage à l'heure d'hiver ne décale pas le compte", () => {
    // Nuit du 24 au 25 octobre 2026, journée de 25 heures
    expect(dayOffset(local(2026, 10, 26, 0), local(2026, 10, 24, 23))).toBe(2)
  })
})

describe('dayState', () => {
  test("passée dès la veille, aujourd'hui toute la journée, à venir dès demain", () => {
    expect(dayState(local(2026, 10, 14, 23, 59), NOW)).toBe('past')
    expect(dayState(local(2026, 10, 15, 8), NOW)).toBe('today')
    expect(dayState(local(2026, 10, 15, 20), NOW)).toBe('today')
    expect(dayState(local(2026, 10, 16, 8), NOW)).toBe('future')
  })
})

describe('shortDateLabel', () => {
  test.each([
    [local(2026, 10, 15, 9), 'Aujourd’hui, 09:00'],
    [local(2026, 10, 16, 18, 15), 'Demain, 18:15'],
    [local(2026, 10, 14, 9), 'Hier, 09:00'],
    [local(2026, 10, 22, 9), '22 oct., 09:00'],
    [local(2027, 1, 5, 9), '5 janv. 2027'],
  ])('%s en français → %j', (date, expected) => {
    expect(shortDateLabel(date, NOW)).toBe(expected)
  })

  test.each([
    [local(2026, 10, 16, 18, 15), 'Tomorrow, 6:15 PM'],
    [local(2026, 10, 22, 9), 'Oct 22, 9:00 AM'],
  ])('%s en anglais → %j', (date, expected) => {
    i18n.global.locale.value = 'en'
    expect(shortDateLabel(date, NOW)).toBe(expected)
  })
})

describe('longDateLabel', () => {
  test('date complète avec le jour de la semaine et l’heure', () => {
    expect(longDateLabel(local(2026, 10, 22, 9))).toBe('jeudi 22 octobre 2026 à 09:00')
  })
})

describe('dayLabel', () => {
  test('jour seul, sans l’heure', () => {
    expect(dayLabel(local(2026, 10, 22, 9))).toBe('22 octobre 2026')
  })

  test('dans la langue active', () => {
    i18n.global.locale.value = 'en'
    expect(dayLabel(local(2026, 10, 22, 9))).toBe('October 22, 2026')
  })
})

describe('sortByStartDate', () => {
  const task = (id: number, startDate: Date | string | null) => ({ id, startDate })

  test('la plus proche en premier, les tâches sans date à la fin dans leur ordre', () => {
    const tasks = [
      task(1, null),
      task(2, local(2026, 10, 20)),
      task(3, null),
      task(4, local(2026, 10, 16).toISOString()),
      task(5, local(2026, 10, 18)),
    ]
    expect(sortByStartDate(tasks).map((t) => t.id)).toEqual([4, 5, 2, 1, 3])
  })

  test('tri stable pour une même date, liste reçue intacte', () => {
    const tasks = [task(1, local(2026, 10, 16)), task(2, local(2026, 10, 16)), task(3, local(2026, 10, 15))]
    expect(sortByStartDate(tasks).map((t) => t.id)).toEqual([3, 1, 2])
    expect(tasks.map((t) => t.id)).toEqual([1, 2, 3])
  })
})
