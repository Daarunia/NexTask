import { describe, expect, test } from 'vitest'
import {
  dueOccurrence,
  hasNextDate,
  monthlyWeekdayOf,
  nextAfterCompletion,
  nextOccurrence,
  nextRunAfter,
  occurrenceCreationDate,
  type RecurrenceRule,
} from '../../src/main/shared/recurrence.helper'
import { describeRecurrence, monthlyDayLabel, ordinalRank } from '../../src/renderer/utils/recurrence.helper'

/**
 * Tests unitaires du calcul des dates d'une série récurrente (`nextOccurrence`,
 * et `nextAfterCompletion` pour le mode « après archivage ») et de leurs
 * libellés, sans lancer l'app ni de navigateur (Vitest, cf. vitest.config.ts).
 *
 * Les cas de changement d'heure dépendent du fuseau Europe/Paris, imposé à
 * tous les tests unitaires par vitest.config.ts.
 */

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
    anchor: 'schedule',
    frequency: 'daily',
    interval: 1,
    weekdays: [],
    monthlyMode: null,
    time: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`,
    endType: 'never',
    endsOn: null,
    maxCount: null,
    generatedCount: 1,
    leadDays: 0,
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

describe('Quotidien', () => {
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

describe('Changement d’heure', () => {
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

describe('Hebdomadaire', () => {
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

describe('Mensuel', () => {
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

describe('Mensuel, Ne jour de la semaine', () => {
  test('le 3e jeudi de chaque mois', () => {
    // 15 octobre 2026 : 3e jeudi (1er octobre = jeudi)
    const r = rule({ frequency: 'monthly', monthlyMode: 'nthWeekday', startsAt: local(2026, 10, 15) })
    expect(monthlyWeekdayOf(r.startsAt)).toEqual({ rank: 3, weekday: 4 })
    expect(series(r, 3)).toEqual([local(2026, 11, 19), local(2026, 12, 17), local(2027, 1, 21)])
  })

  test('un 5e jeudi devient le dernier jeudi du mois', () => {
    // 29 octobre 2026 : 5e jeudi, absent de la plupart des mois
    const r = rule({ frequency: 'monthly', monthlyMode: 'nthWeekday', startsAt: local(2026, 10, 29) })
    expect(monthlyWeekdayOf(r.startsAt)).toEqual({ rank: -1, weekday: 4 })
    // Novembre : 4 jeudis, le dernier le 26 ; décembre : 5 jeudis, le dernier le 31
    expect(series(r, 3)).toEqual([local(2026, 11, 26), local(2026, 12, 31), local(2027, 1, 28)])
  })

  test('un 4e jeudi reste le 4e, même quand il est aussi le dernier', () => {
    // 22 octobre 2026 : 4e jeudi ; décembre en a 5, le 4e est le 24
    const r = rule({ frequency: 'monthly', monthlyMode: 'nthWeekday', startsAt: local(2026, 10, 22) })
    expect(series(r, 2)).toEqual([local(2026, 11, 26), local(2026, 12, 24)])
  })

  test('tous les 2 mois, comptés depuis le mois de début', () => {
    const r = rule({ frequency: 'monthly', interval: 2, monthlyMode: 'nthWeekday', startsAt: local(2026, 10, 15) })
    expect(series(r, 2)).toEqual([local(2026, 12, 17), local(2027, 2, 18)])
    // Depuis janvier (mois sans occurrence), la suivante est en février
    expect(nextOccurrence(r, local(2027, 1, 25))).toEqual(local(2027, 2, 18))
  })

  test("garde l'heure locale : dernier dimanche à 02:30, décalé à 03:30 le jour du passage à l'heure d'été", () => {
    // 29 novembre 2026 : 5e (donc dernier) dimanche, tous les 4 mois → 28 mars 2027
    const r = rule({
      frequency: 'monthly',
      interval: 4,
      monthlyMode: 'nthWeekday',
      startsAt: local(2026, 11, 29, 2, 30),
    })
    const [march, july] = series(r, 2)
    expect(march.toISOString()).toBe('2027-03-28T01:30:00.000Z')
    expect([march.getDate(), march.getHours(), march.getMinutes()]).toEqual([28, 3, 30])
    // Dernier dimanche de juillet 2027 : le 25, de nouveau à 02:30
    expect(july).toEqual(local(2027, 7, 25, 2, 30))
  })
})

describe('Mensuel, dernier jour du mois', () => {
  test('février bissextile, mois de 30 et de 31 jours', () => {
    const r = rule({ frequency: 'monthly', monthlyMode: 'lastDay', startsAt: local(2028, 1, 31) })
    expect(series(r, 4)).toEqual([local(2028, 2, 29), local(2028, 3, 31), local(2028, 4, 30), local(2028, 5, 31)])
  })

  test('février non bissextile', () => {
    const r = rule({ frequency: 'monthly', monthlyMode: 'lastDay', startsAt: local(2026, 1, 31) })
    expect(nextOccurrence(r, r.startsAt)).toEqual(local(2026, 2, 28))
  })

  test('début en milieu de mois : première occurrence à la fin de ce mois', () => {
    const r = rule({ frequency: 'monthly', monthlyMode: 'lastDay', startsAt: local(2026, 11, 10) })
    expect(series(r, 2)).toEqual([local(2026, 11, 30), local(2026, 12, 31)])
  })

  test('tous les 2 mois', () => {
    const r = rule({ frequency: 'monthly', interval: 2, monthlyMode: 'lastDay', startsAt: local(2026, 11, 30) })
    expect(series(r, 2)).toEqual([local(2027, 1, 31), local(2027, 3, 31)])
  })

  test("garde l'heure locale de part et d'autre du passage à l'heure d'hiver", () => {
    // 30 septembre (UTC+2) puis 31 octobre (UTC+1), toujours à 09:00 locale
    const r = rule({ frequency: 'monthly', monthlyMode: 'lastDay', startsAt: local(2026, 9, 30) })
    expect(nextOccurrence(r, r.startsAt)?.toISOString()).toBe('2026-10-31T08:00:00.000Z')
    expect(r.startsAt.toISOString()).toBe('2026-09-30T07:00:00.000Z')
  })
})

describe('Libellés du mensuel', () => {
  test('rang en toutes lettres : 1er, puis 2e, 3e…', () => {
    expect([1, 2, 3, 4].map(ordinalRank)).toEqual(['1er', '2e', '3e', '4e'])
  })

  test('jour du mois déduit de la date de début', () => {
    expect(monthlyDayLabel('dayOfMonth', local(2026, 10, 15))).toBe('le 15')
    expect(monthlyDayLabel('dayOfMonth', local(2026, 10, 1))).toBe('le 1er')
    expect(monthlyDayLabel('nthWeekday', local(2026, 10, 1))).toBe('le 1er jeudi')
    expect(monthlyDayLabel('nthWeekday', local(2026, 10, 15))).toBe('le 3e jeudi')
    expect(monthlyDayLabel('nthWeekday', local(2026, 10, 29))).toBe('le dernier jeudi')
    expect(monthlyDayLabel('lastDay', local(2026, 10, 15))).toBe('le dernier jour')
  })
})

describe('Annuel', () => {
  test('le 29 février tombe le 28 les années non bissextiles', () => {
    const r = rule({ frequency: 'yearly', startsAt: local(2028, 2, 29) })
    expect(series(r, 4)).toEqual([local(2029, 2, 28), local(2030, 2, 28), local(2031, 2, 28), local(2032, 2, 29)])
  })

  test('tous les 2 ans', () => {
    const r = rule({ frequency: 'yearly', interval: 2, startsAt: local(2026, 10, 1) })
    expect(nextOccurrence(r, local(2027, 6, 1))).toEqual(local(2028, 10, 1))
  })
})

describe('Fin de série', () => {
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

describe('Prochaine date à générer', () => {
  test('début à venir : la date qui suit le début (la tâche d’origine est la première)', () => {
    expect(nextRunAfter(rule(), local(2026, 9, 15))).toEqual(local(2026, 10, 2))
  })

  test('début passé : la première date après maintenant, sans rattrapage', () => {
    expect(nextRunAfter(rule(), local(2026, 10, 20, 10))).toEqual(local(2026, 10, 21))
  })
})

describe('Création anticipée', () => {
  test('N jours du calendrier avant la date, à la même heure locale', () => {
    const r = rule({ leadDays: 2 })
    expect(occurrenceCreationDate(r, local(2026, 10, 10))).toEqual(local(2026, 10, 8))
    // Mensuel, dernier jour : le 31 octobre est créé le 28
    const monthly = rule({ frequency: 'monthly', monthlyMode: 'lastDay', leadDays: 3 })
    expect(occurrenceCreationDate(monthly, local(2026, 10, 31))).toEqual(local(2026, 10, 28))
  })

  test('le jour même sans délai', () => {
    const date = local(2026, 10, 10)
    expect(occurrenceCreationDate(rule(), date)).toBe(date)
  })

  test("même heure locale de part et d'autre d'un changement d'heure", () => {
    // Occurrence le lundi 26 octobre (UTC+1), créée le samedi 24 (UTC+2), toutes deux à 09:00
    const created = occurrenceCreationDate(rule({ leadDays: 2 }), local(2026, 10, 26))
    expect(created.toISOString()).toBe('2026-10-24T07:00:00.000Z')
    expect([created.getHours(), created.getMinutes()]).toEqual([9, 0])
  })

  test("occurrence à créer : rien avant l'heure de création, puis la date de l'occurrence", () => {
    const r = rule({ leadDays: 2 })
    expect(dueOccurrence(r, local(2026, 10, 10), local(2026, 10, 8, 8, 59))).toBeNull()
    expect(dueOccurrence(r, local(2026, 10, 10), local(2026, 10, 8, 9))).toEqual({
      date: local(2026, 10, 10),
      skipped: [],
    })
  })

  test('rattrapage : la plus récente des dates dont la création est passée', () => {
    // Le 12 à 10:00, les créations des 10 à 14 sont passées (celle du 14 le 12 à 09:00), pas celle du 15
    const r = rule({ leadDays: 2 })
    expect(dueOccurrence(r, local(2026, 10, 10), local(2026, 10, 12, 10))).toEqual({
      date: local(2026, 10, 14),
      skipped: [local(2026, 10, 10), local(2026, 10, 11), local(2026, 10, 12), local(2026, 10, 13)],
    })
  })

  test('sans délai, le rattrapage du lot 1 est inchangé', () => {
    expect(dueOccurrence(rule(), local(2026, 10, 10), local(2026, 10, 12, 10))).toEqual({
      date: local(2026, 10, 12),
      skipped: [local(2026, 10, 10), local(2026, 10, 11)],
    })
  })

  test('le résumé indique le délai', () => {
    const summary = {
      id: 1,
      anchor: 'schedule' as const,
      frequency: 'monthly' as const,
      interval: 1,
      weekdays: null,
      monthlyMode: 'nthWeekday' as const,
      time: '09:00',
      startsAt: local(2026, 10, 15).toISOString(),
      endType: 'afterCount' as const,
      endsOn: null,
      maxCount: 6,
      generatedCount: 1,
      skipIfPending: true,
      status: 'active' as const,
      nextRunAt: null,
    }
    expect(describeRecurrence({ ...summary, leadDays: 2 })).toBe(
      'Tous les mois le 3e jeudi à 09:00, 6 fois, créée 2 jours avant',
    )
    expect(describeRecurrence({ ...summary, leadDays: 1 })).toBe(
      'Tous les mois le 3e jeudi à 09:00, 6 fois, créée 1 jour avant',
    )
    expect(describeRecurrence({ ...summary, leadDays: 0 })).toBe('Tous les mois le 3e jeudi à 09:00, 6 fois')
  })
})

describe('Après archivage', () => {
  /**
   * Règle « après archivage », à 09:00, tous les jours par défaut.
   * @param overrides Champs remplacés
   */
  function completion(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
    return rule({ anchor: 'completion', ...overrides })
  }

  test("jours : jour local de l'archivage plus l'intervalle, à l'heure de la série", () => {
    expect(nextAfterCompletion(completion({ interval: 3 }), local(2026, 10, 10, 18, 30))).toEqual(local(2026, 10, 13))
    // Archivage à 23:50 ou à 00:10 : c'est le jour local qui compte, pas un écart de 24 h
    expect(nextAfterCompletion(completion(), local(2026, 10, 10, 23, 50))).toEqual(local(2026, 10, 11))
    expect(nextAfterCompletion(completion(), local(2026, 10, 11, 0, 10))).toEqual(local(2026, 10, 12))
    // Archivée avant l'heure de la série : le lendemain quand même
    expect(nextAfterCompletion(completion(), local(2026, 10, 10, 7))).toEqual(local(2026, 10, 11))
  })

  test('semaines : 7 jours par semaine, jours de la semaine ignorés', () => {
    const r = completion({ frequency: 'weekly', interval: 2, weekdays: [1, 3] })
    // Samedi 10 octobre + 2 semaines = samedi 24 octobre
    expect(nextAfterCompletion(r, local(2026, 10, 10, 12))).toEqual(local(2026, 10, 24))
  })

  test('mois : un jour absent tombe sur le dernier jour du mois, mode du mensuel ignoré', () => {
    const r = completion({ frequency: 'monthly', monthlyMode: 'nthWeekday' })
    expect(nextAfterCompletion(r, local(2027, 1, 31, 20))).toEqual(local(2027, 2, 28))
    expect(nextAfterCompletion(r, local(2028, 1, 31, 20))).toEqual(local(2028, 2, 29))
    expect(nextAfterCompletion(r, local(2026, 3, 31, 20))).toEqual(local(2026, 4, 30))
    expect(nextAfterCompletion(completion({ frequency: 'monthly', interval: 3 }), local(2026, 11, 30))).toEqual(
      local(2027, 2, 28),
    )
    // Changement d'année
    expect(nextAfterCompletion(r, local(2026, 12, 15))).toEqual(local(2027, 1, 15))
  })

  test('années : 29 février ramené au 28 les années non bissextiles', () => {
    const r = completion({ frequency: 'yearly' })
    expect(nextAfterCompletion(r, local(2028, 2, 29, 18))).toEqual(local(2029, 2, 28))
    expect(nextAfterCompletion(completion({ frequency: 'yearly', interval: 4 }), local(2028, 2, 29))).toEqual(
      local(2032, 2, 29),
    )
    expect(nextAfterCompletion(r, local(2026, 10, 10))).toEqual(local(2027, 10, 10))
  })

  test("changement d'heure : même heure locale, heure inexistante décalée", () => {
    // Archivée le samedi 24 octobre 2026 (UTC+2), prochaine le lundi 26 (UTC+1) à 09:00
    const autumn = nextAfterCompletion(completion({ interval: 2 }), local(2026, 10, 24, 20))
    expect(autumn?.toISOString()).toBe('2026-10-26T08:00:00.000Z')
    // 02:30 n'existe pas le 28 mars 2027 (passage à l'heure d'été) : 03:30
    const spring = nextAfterCompletion(completion({ time: '02:30' }), local(2027, 3, 27, 22))
    expect([spring?.getDate(), spring?.getHours(), spring?.getMinutes()]).toEqual([28, 3, 30])
  })

  test('fin de la série : nombre atteint, date de fin dépassée (incluse jusqu’au soir)', () => {
    const counted = (generatedCount: number) => completion({ endType: 'afterCount', maxCount: 3, generatedCount })
    expect(nextAfterCompletion(counted(3), local(2026, 10, 10))).toBeNull()
    expect(nextAfterCompletion(counted(2), local(2026, 10, 10))).toEqual(local(2026, 10, 11))

    const endsOn = local(2026, 10, 12, 0, 0)
    expect(nextAfterCompletion(completion({ interval: 2, endType: 'onDate', endsOn }), local(2026, 10, 10))).toEqual(
      local(2026, 10, 12),
    )
    expect(nextAfterCompletion(completion({ interval: 3, endType: 'onDate', endsOn }), local(2026, 10, 10))).toBeNull()
  })

  test('création anticipée : N jours avant la date, sans rattrapage même longtemps après', () => {
    const r = completion({ interval: 3, leadDays: 2 })
    const next = nextAfterCompletion(r, local(2026, 10, 10, 18)) as Date
    expect(next).toEqual(local(2026, 10, 13))
    expect(occurrenceCreationDate(r, next)).toEqual(local(2026, 10, 11))

    expect(dueOccurrence(r, next, local(2026, 10, 11, 8, 59))).toBeNull()
    expect(dueOccurrence(r, next, local(2026, 10, 11, 9))).toEqual({ date: next, skipped: [] })
    // Reprise bien après la date : une seule occurrence, à sa date
    expect(dueOccurrence(r, next, local(2026, 12, 1))).toEqual({ date: next, skipped: [] })
  })

  test('série réactivable tant que sa fin le permet', () => {
    expect(hasNextDate(completion(), local(2026, 10, 10))).toBe(true)
    expect(hasNextDate(completion({ endType: 'afterCount', maxCount: 1 }), local(2026, 10, 10))).toBe(false)
    expect(hasNextDate(completion({ endType: 'onDate', endsOn: local(2026, 10, 5) }), local(2026, 10, 10))).toBe(false)
    expect(hasNextDate(rule(), local(2026, 10, 10))).toBe(true)
  })

  test('le résumé dit « après l’archivage de la précédente »', () => {
    const summary = {
      id: 1,
      anchor: 'completion' as const,
      frequency: 'daily' as const,
      interval: 3,
      weekdays: null,
      monthlyMode: null,
      time: '09:00',
      startsAt: local(2026, 10, 15).toISOString(),
      endType: 'never' as const,
      endsOn: null,
      maxCount: null,
      generatedCount: 1,
      skipIfPending: true,
      leadDays: 0,
      status: 'active' as const,
      nextRunAt: null,
    }
    expect(describeRecurrence(summary)).toBe("3 jours après l'archivage de la précédente, à 09:00")
    expect(describeRecurrence({ ...summary, frequency: 'weekly', interval: 1 })).toBe(
      "1 semaine après l'archivage de la précédente, à 09:00",
    )
    const monthly = { ...summary, frequency: 'monthly' as const, interval: 2, endType: 'afterCount' as const }
    expect(describeRecurrence({ ...monthly, maxCount: 5, leadDays: 1 })).toBe(
      "2 mois après l'archivage de la précédente, à 09:00, 5 fois, créée 1 jour avant",
    )
  })
})

describe('Règle illisible', () => {
  test('aucune date plutôt qu’une boucle sans fin', () => {
    const after = local(2026, 10, 10)
    for (const broken of [
      rule({ time: '9h' }),
      rule({ time: '24:00' }),
      rule({ interval: 0 }),
      rule({ interval: Number.NaN }),
      rule({ startsAt: new Date(Number.NaN), time: '09:00' }),
    ]) {
      expect(nextOccurrence(broken, after)).toBeNull()
      expect(nextAfterCompletion({ ...broken, anchor: 'completion' }, after)).toBeNull()
    }
    expect(nextOccurrence(rule(), new Date(Number.NaN))).toBeNull()
    expect(dueOccurrence(rule(), local(2026, 10, 2), new Date(Number.NaN))).toBeNull()
  })
})
