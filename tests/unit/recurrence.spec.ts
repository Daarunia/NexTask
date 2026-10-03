import { test, expect } from '@playwright/test'
import { nextOccurrence, nextRunAfter, type RecurrenceRule } from '../../src/main/shared/recurrence.helper'

/**
 * Tests unitaires du calcul des dates d'une série récurrente (`nextOccurrence`),
 * sans lancer l'app ni de navigateur (projet « unit » de playwright.config.ts).
 *
 * Fuseau Europe/Paris imposé pour tout le worker : les cas de changement d'heure
 * en dépendent. Node relit le fuseau à chaque affectation de `TZ`, et le module
 * testé ne calcule aucune date à son chargement.
 */
process.env.TZ = 'Europe/Paris'

/**
 * Date en heure locale (Europe/Paris), mois de 1 à 12.
 * @param year Année
 * @param month Mois (1 à 12)
 * @param day Jour
 * @param hours Heures
 * @param minutes Minutes
 */
function local(year: number, month: number, day: number, hours = 9, minutes = 0): Date {
  return new Date(year, month - 1, day, hours, minutes)
}

/**
 * Règle de série, quotidienne par défaut, qui commence au 1er octobre 2026 à 09:00.
 * @param overrides Champs remplacés
 */
function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  const startsAt = overrides.startsAt ?? local(2026, 10, 1)
  return {
    frequency: 'daily',
    interval: 1,
    weekdays: [],
    monthlyMode: null,
    time: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`,
    endType: 'never',
    endsOn: null,
    maxCount: null,
    generatedCount: 1,
    ...overrides,
    startsAt,
  }
}

/**
 * Dates successives d'une série à partir de son début (tâche d'origine non comprise).
 * @param r Règle
 * @param count Nombre de dates
 */
function series(r: RecurrenceRule, count: number): Date[] {
  const dates: Date[] = []
  let after = r.startsAt
  for (let i = 0; i < count; i++) {
    const next = nextOccurrence(r, after)
    if (!next) break
    dates.push(next)
    after = next
  }
  return dates
}

test('le fuseau du worker est Europe/Paris', () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Paris')
})

test.describe('Quotidien', () => {
  test('tous les jours à la même heure', () => {
    expect(series(rule(), 3)).toEqual([local(2026, 10, 2), local(2026, 10, 3), local(2026, 10, 4)])
  })

  test('strictement après la date de référence', () => {
    const r = rule()
    expect(nextOccurrence(r, local(2026, 10, 5))).toEqual(local(2026, 10, 6))
    expect(nextOccurrence(r, local(2026, 10, 5, 8, 59))).toEqual(local(2026, 10, 5))
  })

  test('avant le début de la série, la première date est le début', () => {
    expect(nextOccurrence(rule(), local(2026, 9, 1))).toEqual(local(2026, 10, 1))
  })

  test("l'intervalle se compte depuis le début, pas depuis la date de référence", () => {
    const r = rule({ interval: 3 })
    // Jours 1, 4, 7, 10… d'octobre : depuis le 5, la prochaine est le 7
    expect(nextOccurrence(r, local(2026, 10, 5, 12))).toEqual(local(2026, 10, 7))
    expect(nextOccurrence(r, local(2026, 10, 7))).toEqual(local(2026, 10, 10))
  })

  test("garde l'heure locale de part et d'autre du passage à l'heure d'hiver", () => {
    const r = rule({ startsAt: local(2026, 10, 24) })
    const [first, second] = series(r, 2)
    expect(first).toEqual(local(2026, 10, 25))
    expect(second).toEqual(local(2026, 10, 26))
    // 23 h d'écart en UTC le jour du changement, 24 h le lendemain
    expect(first.toISOString()).toBe('2026-10-25T08:00:00.000Z')
    expect(second.toISOString()).toBe('2026-10-26T08:00:00.000Z')
  })
})

test.describe('Changement d’heure', () => {
  test('heure inexistante (passage à l’heure d’été) : 02:30 devient 03:30', () => {
    const r = rule({ startsAt: local(2026, 3, 28, 2, 30) })
    const [gap, after] = series(r, 2)
    expect(gap.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect([gap.getHours(), gap.getMinutes()]).toEqual([3, 30])
    // Le lendemain, l'heure de la série reprend
    expect([after.getDate(), after.getHours(), after.getMinutes()]).toEqual([30, 2, 30])
  })

  test('heure ambiguë (retour à l’heure d’hiver) : la première des deux', () => {
    const r = rule({ startsAt: local(2026, 10, 24, 2, 30) })
    const ambiguous = nextOccurrence(r, r.startsAt)
    // 02:30 heure d'été (UTC+2), et non 02:30 heure d'hiver (01:30 UTC)
    expect(ambiguous?.toISOString()).toBe('2026-10-25T00:30:00.000Z')
  })
})

test.describe('Hebdomadaire', () => {
  test('jours ouvrés : du lundi au vendredi, sans le week-end', () => {
    // 1er octobre 2026 : un jeudi
    const r = rule({ frequency: 'weekly', weekdays: [1, 2, 3, 4, 5] })
    expect(series(r, 3)).toEqual([local(2026, 10, 2), local(2026, 10, 5), local(2026, 10, 6)])
  })

  test('toutes les 2 semaines, comptées depuis la semaine ISO du début', () => {
    // Début le jeudi 1er octobre (semaine du lundi 28 septembre), les mardis et jeudis
    const r = rule({ frequency: 'weekly', interval: 2, weekdays: [2, 4] })
    expect(series(r, 4)).toEqual([local(2026, 10, 13), local(2026, 10, 15), local(2026, 10, 27), local(2026, 10, 29)])
    // Depuis une semaine sans occurrence (celle du 5 octobre), la suivante est le mardi 13
    expect(nextOccurrence(r, local(2026, 10, 7))).toEqual(local(2026, 10, 13))
  })

  test('les jours de la première semaine antérieurs au début sont ignorés', () => {
    // Le lundi 28 septembre est avant le début : la première date suivante est le lundi 5
    const r = rule({ frequency: 'weekly', weekdays: [1] })
    expect(nextOccurrence(r, local(2026, 9, 1))).toEqual(local(2026, 10, 5))
  })

  test('sans jour choisi, aucune date', () => {
    expect(nextOccurrence(rule({ frequency: 'weekly', weekdays: [] }), local(2026, 10, 1))).toBeNull()
  })
})

test.describe('Mensuel', () => {
  test('le 31 tombe sur le dernier jour des mois plus courts, puis revient au 31', () => {
    const r = rule({ frequency: 'monthly', monthlyMode: 'dayOfMonth', startsAt: local(2026, 1, 31) })
    expect(series(r, 4)).toEqual([local(2026, 2, 28), local(2026, 3, 31), local(2026, 4, 30), local(2026, 5, 31)])
  })

  test('le 30 tombe sur le 29 février les années bissextiles', () => {
    const r = rule({ frequency: 'monthly', monthlyMode: 'dayOfMonth', startsAt: local(2028, 1, 30) })
    expect(nextOccurrence(r, r.startsAt)).toEqual(local(2028, 2, 29))
  })

  test('tous les 2 mois, comptés depuis le mois de début', () => {
    const r = rule({ frequency: 'monthly', interval: 2, startsAt: local(2026, 1, 15) })
    expect(series(r, 3)).toEqual([local(2026, 3, 15), local(2026, 5, 15), local(2026, 7, 15)])
    // Depuis avril (mois sans occurrence), la suivante est en mai
    expect(nextOccurrence(r, local(2026, 4, 20))).toEqual(local(2026, 5, 15))
  })
})

test.describe('Annuel', () => {
  test('le 29 février tombe le 28 les années non bissextiles', () => {
    const r = rule({ frequency: 'yearly', startsAt: local(2028, 2, 29) })
    expect(series(r, 4)).toEqual([local(2029, 2, 28), local(2030, 2, 28), local(2031, 2, 28), local(2032, 2, 29)])
  })

  test('tous les 2 ans', () => {
    const r = rule({ frequency: 'yearly', interval: 2, startsAt: local(2026, 10, 1) })
    expect(nextOccurrence(r, local(2027, 6, 1))).toEqual(local(2028, 10, 1))
  })
})

test.describe('Fin de série', () => {
  test('date de fin incluse jusqu’à la fin de sa journée locale', () => {
    const r = rule({ startsAt: local(2026, 10, 1, 23, 30), endType: 'onDate', endsOn: local(2026, 10, 3, 0, 0) })
    expect(series(r, 5)).toEqual([local(2026, 10, 2, 23, 30), local(2026, 10, 3, 23, 30)])
    expect(nextOccurrence(r, local(2026, 10, 3, 23, 30))).toBeNull()
  })

  test('après N occurrences, la tâche d’origine comprise', () => {
    const r = rule({ endType: 'afterCount', maxCount: 3 })
    expect(nextOccurrence({ ...r, generatedCount: 1 }, r.startsAt)).toEqual(local(2026, 10, 2))
    expect(nextOccurrence({ ...r, generatedCount: 2 }, local(2026, 10, 2))).toEqual(local(2026, 10, 3))
    expect(nextOccurrence({ ...r, generatedCount: 3 }, local(2026, 10, 3))).toBeNull()
    // Une seule occurrence : la tâche d'origine
    expect(nextOccurrence({ ...r, maxCount: 1 }, r.startsAt)).toBeNull()
  })
})

test.describe('Prochaine date à générer', () => {
  test('début à venir : la date qui suit le début (la tâche d’origine est la première)', () => {
    expect(nextRunAfter(rule(), local(2026, 9, 15))).toEqual(local(2026, 10, 2))
  })

  test('début passé : la première date après maintenant, sans rattrapage', () => {
    expect(nextRunAfter(rule(), local(2026, 10, 20, 10))).toEqual(local(2026, 10, 21))
  })
})
