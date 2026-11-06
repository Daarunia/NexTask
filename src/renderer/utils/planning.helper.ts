import { nextOccurrence, toRecurrenceRule } from '@core/shared/recurrence.helper'
import type { RecurrenceListItem } from '@core/shared/recurrence.constants'
import type { Board } from '../types/board.types'
import type { Stage } from '../types/stage.types'
import type { Task } from '../types/task.types'
import { DEFAULT_START_HOUR, dayOffset } from './date.helper'

/**
 * Calculs purs de la vue Planning : tâches retenues et leur ordre, dates données
 * à une tâche déplacée ou créée, place d'une nouvelle tâche, occurrences à venir
 * des séries. L'heure courante est toujours passée en paramètre.
 */

// Dernière heure proposée à une tâche créée le jour même, pour rester dans la journée
const LAST_START_HOUR = 23

// Écart de rang entre deux colonnes, supérieur à toute position de carte
const STAGE_RANK_STEP = 1_000_000

// Occurrences calculées au plus par série, contre une boucle trop longue sur une date lointaine
const MAX_PROJECTED_RUNS = 2000

/** Occurrence à venir d'une série, pas encore créée. */
export interface ProjectedOccurrence {
  seriesId: number
  title: string
  date: Date
}

/** Nouvelle position d'une tâche de la colonne, décalée par une insertion. */
export interface PositionChange {
  id: number
  position: number
}

/**
 * Clé locale d'un jour (`YYYY-MM-DD`), jamais `toISOString`, qui décalerait le
 * jour selon le fuseau.
 * @param date Date
 */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Jour d'une clé locale, à minuit heure locale.
 * @param key Clé `YYYY-MM-DD`
 */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Date décalée d'un nombre de jours, à la même heure locale même si l'heure
 * d'été change entre les deux.
 * @param date Date
 * @param days Jours à ajouter, négatif pour reculer
 */
export function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

/**
 * Nouvelle date d'une tâche déposée sur un jour : ce jour, à l'heure qu'elle avait.
 * @param current Date de début actuelle de la tâche
 * @param day Jour d'arrivée
 */
export function movedStartDate(current: Date, day: Date): Date {
  const date = new Date(day)
  date.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds())
  return date
}

/**
 * Date donnée à une tâche qui n'avait pas d'heure, créée ou déposée sur un jour :
 * 09:00, ou le jour même si 09:00 est passé, l'heure pleine suivante (23:00 au
 * plus), pour ne pas déclencher un rappel aussitôt.
 * @param day Jour choisi
 * @param now Maintenant
 */
export function dayStartDate(day: Date, now: Date): Date {
  const date = new Date(day)
  const isTodayAfterStart = dayOffset(day, now) === 0 && now.getHours() >= DEFAULT_START_HOUR
  date.setHours(isTodayAfterStart ? Math.min(now.getHours() + 1, LAST_START_HOUR) : DEFAULT_START_HOUR, 0, 0, 0)
  return date
}

/**
 * Tableau d'une tâche, celui de sa colonne pour une tâche d'un cache antérieur aux tableaux.
 * @param task Tâche active
 * @param stages Colonnes de tous les tableaux
 */
export function boardIdOf(
  task: Pick<Task, 'boardId' | 'stageId'>,
  stages: readonly Pick<Stage, 'id' | 'boardId'>[],
): number | null | undefined {
  return task.boardId ?? stages.find((stage) => stage.id === task.stageId)?.boardId
}

/**
 * Tâches des tableaux retenus par le filtre, toutes sans tableau sélectionné.
 * @param tasks Tâches actives
 * @param boardIds Tableaux sélectionnés
 * @param stages Colonnes de tous les tableaux
 */
export function tasksOfBoards<T extends Pick<Task, 'boardId' | 'stageId'>>(
  tasks: readonly T[],
  boardIds: readonly number[],
  stages: readonly Pick<Stage, 'id' | 'boardId'>[],
): T[] {
  if (!boardIds.length) return [...tasks]
  return tasks.filter((task) => {
    const boardId = boardIdOf(task, stages)
    return boardId !== null && boardId !== undefined && boardIds.includes(boardId)
  })
}

/**
 * Rang de chaque colonne, dans l'ordre des tableaux puis de leurs colonnes.
 * @param boards Tableaux, dans leur ordre
 * @param stages Colonnes de tous les tableaux
 */
export function stageRanks(
  boards: readonly Pick<Board, 'id'>[],
  stages: readonly Pick<Stage, 'id' | 'boardId' | 'position'>[],
): Map<number, number> {
  const ranks = new Map<number, number>()

  for (const board of boards) {
    const ofBoard = stages.filter((stage) => stage.boardId === board.id)
    ofBoard.sort((a, b) => a.position - b.position || a.id - b.id)
    for (const stage of ofBoard) ranks.set(stage.id, ranks.size)
  }

  return ranks
}

/**
 * Rang d'une tâche à date égale : ordre des tableaux, des colonnes, puis position.
 * @param task Tâche
 * @param ranks Rang des colonnes (cf. `stageRanks`)
 */
export function taskRank(task: Pick<Task, 'stageId' | 'position'>, ranks: ReadonlyMap<number, number>): number {
  return (ranks.get(task.stageId) ?? ranks.size) * STAGE_RANK_STEP + task.position
}

/**
 * Tâches sans date du panneau « À planifier », dans l'ordre du tableau.
 * @param tasks Tâches retenues
 * @param ranks Rang des colonnes
 */
export function unscheduledTasks<T extends Pick<Task, 'startDate' | 'stageId' | 'position'>>(
  tasks: readonly T[],
  ranks: ReadonlyMap<number, number>,
): T[] {
  return tasks.filter((task) => !task.startDate).sort((a, b) => taskRank(a, ranks) - taskRank(b, ranks))
}

/**
 * Tâches en retard que la période affichée ne montre pas, la plus ancienne en
 * premier : leur jour est passé et antérieur au premier jour affiché.
 * @param tasks Tâches retenues
 * @param rangeStart Premier jour affiché
 * @param now Maintenant
 */
export function overdueBeforeRange<T extends Pick<Task, 'startDate'>>(
  tasks: readonly T[],
  rangeStart: Date,
  now: Date,
): T[] {
  const time = (task: T) => new Date(task.startDate as Date).getTime()
  return tasks
    .filter((task) => {
      if (!task.startDate) return false
      const date = new Date(task.startDate)
      return dayOffset(date, now) < 0 && date < rangeStart
    })
    .sort((a, b) => time(a) - time(b))
}

/**
 * Colonne d'une tâche créée depuis le Planning. Le tableau courant s'il est
 * retenu par le filtre, sinon le premier retenu, en sautant ceux sans colonne.
 * Dans ce tableau, la première colonne dépliée, sinon la première.
 * @param boards Tableaux, dans leur ordre
 * @param stages Colonnes de tous les tableaux
 * @param filterIds Tableaux sélectionnés, aucun pour tous
 * @param currentId Tableau courant
 * @param collapsedIds Colonnes repliées
 * @returns L'id de la colonne, `null` si aucun tableau retenu n'en a
 */
export function creationStageId(
  boards: readonly Pick<Board, 'id'>[],
  stages: readonly Pick<Stage, 'id' | 'boardId' | 'position'>[],
  filterIds: readonly number[],
  currentId: number | null | undefined,
  collapsedIds: readonly number[],
): number | null {
  const kept = boards.filter((board) => !filterIds.length || filterIds.includes(board.id))
  const ordered = [...kept].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId))

  for (const board of ordered) {
    const ofBoard = stages.filter((stage) => stage.boardId === board.id)
    ofBoard.sort((a, b) => a.position - b.position || a.id - b.id)
    const stage = ofBoard.find((candidate) => !collapsedIds.includes(candidate.id)) ?? ofBoard[0]
    if (stage) return stage.id
  }

  return null
}

/**
 * Position d'une nouvelle tâche dans sa colonne, en haut ou après la dernière.
 * @param stageTasks Tâches actives de la colonne
 * @param place Paramètre « nouvelle tâche en haut ou en bas »
 */
export function newTaskPosition(stageTasks: readonly Pick<Task, 'position'>[], place: 'top' | 'bottom'): number {
  if (place === 'top') return 0
  return stageTasks.reduce((next, task) => Math.max(next, task.position + 1), 0)
}

/**
 * Positions à enregistrer après une insertion en haut d'une colonne, le serveur
 * ne décalant pas les autres tâches à la création.
 * @param stageTasks Tâches actives de la colonne, sans celle créée
 */
export function positionsAfterTopInsert(stageTasks: readonly Pick<Task, 'id' | 'position'>[]): PositionChange[] {
  return [...stageTasks]
    .sort((a, b) => a.position - b.position)
    .map((task, index) => ({ id: task.id, position: index + 1, previous: task.position }))
    .filter(({ position, previous }) => position !== previous)
    .map(({ id, position }) => ({ id, position }))
}

/**
 * Occurrences à venir d'une série sur une période. Seule une série active au
 * calendrier a des dates prévisibles : celle « après archivage » attend
 * l'archivage de la précédente. L'aperçu reste indicatif, car « Ne pas empiler »
 * peut sauter une date au moment de la génération.
 * @param series Série
 * @param rangeStart Premier instant de la période
 * @param rangeEnd Fin de la période (exclue)
 */
export function projectOccurrences(
  series: RecurrenceListItem,
  rangeStart: Date,
  rangeEnd: Date,
): ProjectedOccurrence[] {
  if (series.status !== 'active' || series.anchor !== 'schedule' || !series.nextRunAt) return []

  const rule = toRecurrenceRule(series)
  const occurrences: ProjectedOccurrence[] = []
  let date: Date | null = new Date(series.nextRunAt)

  // nextOccurrence compte les occurrences déjà générées : chaque date calculée en ajoute une
  for (let run = 0; date && date < rangeEnd && run < MAX_PROJECTED_RUNS; run++) {
    if (date >= rangeStart) occurrences.push({ seriesId: series.id, title: series.title, date })
    rule.generatedCount += 1
    date = nextOccurrence(rule, date)
  }

  return occurrences
}
