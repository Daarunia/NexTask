import { describe, expect, test } from 'vitest'
import type { RecurrenceListItem } from '@core/shared/recurrence.constants'
import {
  boardIdOf,
  creationStageId,
  dayKey,
  dayStartDate,
  movedStartDate,
  newTaskPosition,
  overdueBeforeRange,
  parseDayKey,
  positionsAfterTopInsert,
  projectOccurrences,
  shiftDays,
  stageRanks,
  taskRank,
  tasksOfBoards,
  unscheduledTasks,
} from '../../src/renderer/utils/planning.helper'

/**
 * Tests unitaires des calculs de la vue Planning : jours, dates d'une tâche
 * déplacée ou créée, tâches retenues et leur ordre, place d'une nouvelle tâche
 * et occurrences à venir des séries.
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

const BOARDS = [{ id: 10 }, { id: 20 }]
const STAGES = [
  { id: 2, boardId: 10, position: 1 },
  { id: 1, boardId: 10, position: 0 },
  { id: 3, boardId: 20, position: 0 },
]

describe('jours', () => {
  test('dayKey lit le jour local, y compris juste après minuit', () => {
    expect(dayKey(local(2026, 3, 1, 0, 5))).toBe('2026-03-01')
    expect(dayKey(local(2026, 12, 31, 23, 59))).toBe('2026-12-31')
  })

  test('parseDayKey rend le jour à minuit, heure locale', () => {
    expect(parseDayKey('2026-11-06')).toEqual(local(2026, 11, 6, 0))
  })

  test('shiftDays garde l’heure locale à travers un changement d’heure', () => {
    // Passage à l'heure d'hiver le 25 octobre 2026, à l'heure d'été le 28 mars 2027
    expect(shiftDays(local(2026, 10, 24, 10), 2)).toEqual(local(2026, 10, 26, 10))
    expect(shiftDays(local(2027, 3, 27, 10), 2)).toEqual(local(2027, 3, 29, 10))
  })

  test('shiftDays recule et change de mois', () => {
    expect(shiftDays(local(2026, 3, 1), -7)).toEqual(local(2026, 2, 22))
  })
})

describe('movedStartDate', () => {
  test('prend le jour d’arrivée et garde l’heure', () => {
    expect(movedStartDate(local(2026, 10, 15, 10, 30), local(2026, 10, 20, 0))).toEqual(local(2026, 10, 20, 10, 30))
  })

  test('garde l’heure à travers un changement d’heure', () => {
    expect(movedStartDate(local(2026, 10, 24, 8, 15), local(2026, 10, 25, 0))).toEqual(local(2026, 10, 25, 8, 15))
    expect(movedStartDate(local(2027, 3, 27, 8, 15), local(2027, 3, 28, 0))).toEqual(local(2027, 3, 28, 8, 15))
  })
})

describe('dayStartDate', () => {
  test('09:00 un autre jour', () => {
    expect(dayStartDate(local(2026, 10, 20, 0), NOW)).toEqual(local(2026, 10, 20, 9))
    expect(dayStartDate(local(2026, 10, 1, 0), NOW)).toEqual(local(2026, 10, 1, 9))
  })

  test('09:00 aujourd’hui avant cette heure', () => {
    expect(dayStartDate(local(2026, 10, 15, 0), local(2026, 10, 15, 8, 30))).toEqual(local(2026, 10, 15, 9))
  })

  test('l’heure pleine suivante aujourd’hui passé 09:00', () => {
    expect(dayStartDate(local(2026, 10, 15, 0), NOW)).toEqual(local(2026, 10, 15, 15))
    expect(dayStartDate(local(2026, 10, 15, 0), local(2026, 10, 15, 9, 0))).toEqual(local(2026, 10, 15, 10))
  })

  test('23:00 au plus en fin de soirée', () => {
    expect(dayStartDate(local(2026, 10, 15, 0), local(2026, 10, 15, 23, 40))).toEqual(local(2026, 10, 15, 23))
  })
})

describe('filtre par tableau', () => {
  const tasks = [
    { id: 1, boardId: 10, stageId: 1 },
    { id: 2, boardId: 20, stageId: 3 },
    { id: 3, boardId: null, stageId: 3 }, // cache antérieur aux tableaux, rattachée par sa colonne
    { id: 4, boardId: null, stageId: 99 }, // colonne inconnue
  ]

  test('boardIdOf préfère le tableau de la tâche, sinon celui de sa colonne', () => {
    expect(boardIdOf(tasks[0], STAGES)).toBe(10)
    expect(boardIdOf(tasks[2], STAGES)).toBe(20)
    expect(boardIdOf(tasks[3], STAGES)).toBeUndefined()
  })

  test('sans sélection, toutes les tâches', () => {
    expect(tasksOfBoards(tasks, [], STAGES)).toEqual(tasks)
  })

  test('un tableau, puis plusieurs', () => {
    expect(tasksOfBoards(tasks, [10], STAGES).map((task) => task.id)).toEqual([1])
    expect(tasksOfBoards(tasks, [20], STAGES).map((task) => task.id)).toEqual([2, 3])
    expect(tasksOfBoards(tasks, [10, 20], STAGES).map((task) => task.id)).toEqual([1, 2, 3])
  })
})

describe('ordre', () => {
  const ranks = stageRanks(BOARDS, STAGES)

  test('les colonnes suivent les tableaux, puis leur position', () => {
    expect([...ranks.entries()]).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ])
  })

  test('le rang d’une tâche suit sa colonne, puis sa position', () => {
    const first = taskRank({ stageId: 1, position: 500 }, ranks)
    const second = taskRank({ stageId: 2, position: 0 }, ranks)
    const third = taskRank({ stageId: 2, position: 1 }, ranks)
    expect(first).toBeLessThan(second)
    expect(second).toBeLessThan(third)
  })

  test('une colonne inconnue passe après les autres', () => {
    expect(taskRank({ stageId: 99, position: 0 }, ranks)).toBeGreaterThan(
      taskRank({ stageId: 3, position: 999 }, ranks),
    )
  })

  test('unscheduledTasks ne garde que les tâches sans date, dans l’ordre du tableau', () => {
    const tasks = [
      { id: 1, stageId: 3, position: 0, startDate: null },
      { id: 2, stageId: 1, position: 1, startDate: null },
      { id: 3, stageId: 1, position: 0, startDate: NOW },
      { id: 4, stageId: 1, position: 0, startDate: null },
    ]
    expect(unscheduledTasks(tasks, ranks).map((task) => task.id)).toEqual([4, 2, 1])
  })
})

describe('overdueBeforeRange', () => {
  const tasks = [
    { id: 1, startDate: local(2026, 9, 1) },
    { id: 2, startDate: local(2026, 8, 1) },
    { id: 3, startDate: local(2026, 10, 14) }, // en retard, mais affichée
    { id: 4, startDate: local(2026, 10, 15, 8) }, // aujourd'hui, pas en retard
    { id: 5, startDate: null },
  ]

  test('période qui contient aujourd’hui : les plus anciennes d’abord, sans celles affichées', () => {
    expect(overdueBeforeRange(tasks, local(2026, 9, 28, 0), NOW).map((task) => task.id)).toEqual([2, 1])
  })

  test('période à venir : une tâche à venir avant la période n’est pas en retard', () => {
    const upcoming = [...tasks, { id: 6, startDate: local(2026, 10, 20) }]
    const ids = overdueBeforeRange(upcoming, local(2026, 11, 1, 0), NOW).map((task) => task.id)
    expect(ids).toEqual([2, 1, 3])
  })

  test('période passée : seules les tâches antérieures restent', () => {
    expect(overdueBeforeRange(tasks, local(2026, 8, 15, 0), NOW).map((task) => task.id)).toEqual([2])
  })
})

describe('creationStageId', () => {
  test('la première colonne du tableau courant', () => {
    expect(creationStageId(BOARDS, STAGES, [], 20, [])).toBe(3)
    expect(creationStageId(BOARDS, STAGES, [], 10, [])).toBe(1)
  })

  test('saute les colonnes repliées, sauf si elles le sont toutes', () => {
    expect(creationStageId(BOARDS, STAGES, [], 10, [1])).toBe(2)
    expect(creationStageId(BOARDS, STAGES, [], 10, [1, 2])).toBe(1)
  })

  test('le tableau courant hors du filtre cède la place au premier du filtre', () => {
    expect(creationStageId(BOARDS, STAGES, [20], 10, [])).toBe(3)
    expect(creationStageId(BOARDS, STAGES, [10, 20], 20, [])).toBe(3)
  })

  test('saute les tableaux sans colonne', () => {
    expect(creationStageId([{ id: 30 }, ...BOARDS], STAGES, [], 30, [])).toBe(1)
  })

  test('aucune colonne à proposer', () => {
    expect(creationStageId([{ id: 30 }], STAGES, [], 30, [])).toBeNull()
    expect(creationStageId([], [], [], null, [])).toBeNull()
  })
})

describe('place d’une nouvelle tâche', () => {
  test('newTaskPosition : en haut, ou après la dernière malgré les trous', () => {
    const tasks = [{ position: 0 }, { position: 4 }]
    expect(newTaskPosition(tasks, 'top')).toBe(0)
    expect(newTaskPosition(tasks, 'bottom')).toBe(5)
    expect(newTaskPosition([], 'bottom')).toBe(0)
  })

  test('positionsAfterTopInsert décale les tâches, sans celles déjà en place', () => {
    const tasks = [
      { id: 1, position: 2 },
      { id: 2, position: 0 },
      { id: 3, position: 1 },
    ]
    expect(positionsAfterTopInsert(tasks)).toEqual([
      { id: 2, position: 1 },
      { id: 3, position: 2 },
      { id: 1, position: 3 },
    ])
    expect(positionsAfterTopInsert([{ id: 1, position: 1 }])).toEqual([])
  })
})

describe('projectOccurrences', () => {
  /**
   * Série quotidienne à 09:00, dont la prochaine date est le 16 octobre 2026.
   * @param overrides Champs à remplacer
   */
  function series(overrides: Partial<RecurrenceListItem> = {}): RecurrenceListItem {
    return {
      id: 1,
      title: 'Série',
      anchor: 'schedule',
      frequency: 'daily',
      interval: 1,
      weekdays: null,
      monthlyMode: null,
      time: '09:00',
      startsAt: local(2026, 10, 1).toISOString(),
      endType: 'never',
      endsOn: null,
      maxCount: null,
      generatedCount: 1,
      skipIfPending: false,
      leadDays: 0,
      status: 'active',
      nextRunAt: local(2026, 10, 16).toISOString(),
      ...overrides,
    }
  }

  /**
   * Jours des occurrences d'une série sur la période du 15 au 20 octobre 2026.
   * @param item Série
   */
  function days(item: RecurrenceListItem): string[] {
    return projectOccurrences(item, local(2026, 10, 15, 0), local(2026, 10, 20, 0)).map(({ date }) => dayKey(date))
  }

  test('part de la prochaine date, fin de période exclue', () => {
    expect(days(series())).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'])
  })

  test('donne le titre et l’id de la série', () => {
    const [first] = projectOccurrences(series(), local(2026, 10, 15, 0), local(2026, 10, 20, 0))
    expect(first).toMatchObject({ seriesId: 1, title: 'Série' })
    expect(first.date).toEqual(local(2026, 10, 16))
  })

  test('saute les occurrences avant le début de la période', () => {
    const shown = projectOccurrences(series(), local(2026, 10, 18, 0), local(2026, 10, 20, 0))
    expect(shown.map(({ date }) => dayKey(date))).toEqual(['2026-10-18', '2026-10-19'])
  })

  test('s’arrête au nombre d’occurrences de la série', () => {
    expect(days(series({ endType: 'afterCount', maxCount: 3, generatedCount: 1 }))).toEqual([
      '2026-10-16',
      '2026-10-17',
    ])
  })

  test('s’arrête à la date de fin de la série, incluse', () => {
    const endsOn = local(2026, 10, 17).toISOString()
    expect(days(series({ endType: 'onDate', endsOn }))).toEqual(['2026-10-16', '2026-10-17'])
  })

  test('rien pour une série en pause, terminée, « après archivage » ou sans prochaine date', () => {
    expect(days(series({ status: 'paused' }))).toEqual([])
    expect(days(series({ status: 'ended' }))).toEqual([])
    expect(days(series({ anchor: 'completion' }))).toEqual([])
    expect(days(series({ nextRunAt: null }))).toEqual([])
  })
})
