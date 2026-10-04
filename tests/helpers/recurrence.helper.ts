import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { RecurrenceInput, RecurrenceSummary } from '../../src/main/shared/recurrence.constants'
import { API } from './api.helper'

/**
 * Appels API partagés par les tests E2E des tâches récurrentes : création
 * d'une tâche récurrente, passage de la génération, archivage et
 * restauration, état d'une série, lecture des tâches, des séries et des
 * colonnes. Préparent les données plus vite que par l'interface, et
 * contrôlent l'état réel de la base après un geste dans l'interface.
 */

/** Tâche telle que renvoyée par l'API, avec sa série. */
export interface RecurringTask {
  id: number
  title: string
  description: string
  version: string
  position: number
  stageId: number | null
  isHistorized: boolean
  historizationDate: string | null
  startDate: string | null
  notifiedAt: string | null
  recurrenceId: number | null
  occurrenceDate: string | null
  recurrence: RecurrenceSummary | null
  tags: { id: number; name: string }[]
}

/** Résultat d'un passage de la génération (POST /test/run-recurrences). */
export interface GenerationResult {
  created: number
  skipped: number
  ended: number
  waiting: number
}

/** Règle quotidienne sans fin, qui empile les occurrences (la tâche d'origine n'empêche rien). */
export const DAILY: RecurrenceInput = { frequency: 'daily', interval: 1, endType: 'never', skipIfPending: false }

/** Règle « après archivage » : 3 jours après l'archivage de la précédente, sans fin. */
export const AFTER_ARCHIVE: RecurrenceInput = {
  anchor: 'completion',
  frequency: 'daily',
  interval: 3,
  endType: 'never',
  skipIfPending: true,
}

/**
 * Date en heure locale, à `days` jours d'aujourd'hui (calendrier, pas 24 h :
 * juste aussi autour d'un changement d'heure).
 * @param days Décalage en jours
 * @param hours Heures
 * @param minutes Minutes
 */
export function localDate(days: number, hours = 9, minutes = 0): Date {
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  date.setDate(date.getDate() + days)
  return date
}

/**
 * Décale une date d'un nombre de minutes.
 * @param date Date de départ
 * @param minutes Minutes (négatives pour reculer)
 */
export function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

/**
 * Date à `days` jours du jour local d'une date (calendrier), à une heure locale :
 * prochaine date attendue d'une série « après archivage » archivée à cette date.
 * @param date Date de référence (archivage)
 * @param days Décalage en jours
 * @param hours Heures
 * @param minutes Minutes
 */
export function daysAfter(date: Date | string, days: number, hours = 9, minutes = 0): Date {
  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  result.setDate(result.getDate() + days)
  return result
}

/** Ids des colonnes, par nom. */
export async function stageIds(request: APIRequestContext): Promise<Record<string, number>> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as { id: number; name: string }[]
  return Object.fromEntries(stages.map((stage) => [stage.name, stage.id]))
}

/**
 * Crée une tâche récurrente via POST /tasks, et la renvoie.
 * @param request Contexte de requête Playwright
 * @param data Titre, date de début, règle, et au besoin colonne, version et tags
 */
export async function createRecurringTask(
  request: APIRequestContext,
  data: {
    title: string
    startDate: Date
    recurrence: RecurrenceInput
    stageId?: number
    version?: string
    tags?: string[]
    position?: number
  },
): Promise<RecurringTask> {
  const stageId = data.stageId ?? (await stageIds(request))['A faire']
  const res = await request.post(`${API}/tasks`, {
    data: {
      stageId,
      position: data.position ?? 0,
      title: data.title,
      version: data.version ?? '1.5.0',
      description: '',
      startDate: data.startDate.toISOString(),
      tags: data.tags ?? [],
      recurrence: data.recurrence,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as RecurringTask
}

/**
 * Déclenche un passage de la génération des tâches récurrentes.
 * @param request Contexte de requête Playwright
 * @param now Horodatage de référence
 */
export async function runRecurrences(request: APIRequestContext, now: Date): Promise<GenerationResult> {
  const res = await request.post(`${API}/test/run-recurrences`, { data: { now: now.toISOString() } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as GenerationResult
}

/** Relit une tâche via GET /tasks/:id. */
export async function getTask(request: APIRequestContext, id: number): Promise<RecurringTask> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as RecurringTask
}

/**
 * Tâches d'une série (archivées comprises), de la plus ancienne à la plus récente.
 * @param request Contexte de requête Playwright
 * @param recurrenceId Id de la série
 */
export async function seriesTasks(request: APIRequestContext, recurrenceId: number): Promise<RecurringTask[]> {
  const res = await request.get(`${API}/tasks`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as RecurringTask[])
    .filter((task) => task.recurrenceId === recurrenceId)
    .sort((a, b) => a.id - b.id)
}

/**
 * Archive une tâche : à la date donnée (PATCH /tasks/:id, date injectée), ou
 * maintenant (PUT /tasks/:id, comme le bouton de la carte). Renvoie la tâche archivée.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 * @param at Date d'archivage, maintenant sans elle
 */
export async function archiveTask(request: APIRequestContext, id: number, at?: Date): Promise<RecurringTask> {
  const res = at
    ? await request.patch(`${API}/tasks/${id}`, {
        data: { isHistorized: true, historizationDate: at.toISOString(), stageId: null },
      })
    : await request.put(`${API}/tasks/${id}`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return getTask(request, id)
}

/**
 * Restaure une tâche archivée (POST /tasks/:id/restore, aussi utilisé par l'annulation d'un archivage).
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 * @returns La tâche restaurée, et l'occurrence retirée avec elle
 */
export async function restoreTask(
  request: APIRequestContext,
  id: number,
): Promise<RecurringTask & { removedOccurrenceId: number | null }> {
  const res = await request.post(`${API}/tasks/${id}/restore`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

/**
 * Change l'état d'une série (PATCH /recurrences/:id), et renvoie son résumé.
 * @param request Contexte de requête Playwright
 * @param recurrenceId Id de la série
 * @param status Nouvel état
 */
export async function setSeriesStatus(
  request: APIRequestContext,
  recurrenceId: number,
  status: 'active' | 'paused' | 'ended',
): Promise<RecurrenceSummary> {
  const res = await request.patch(`${API}/recurrences/${recurrenceId}`, { data: { status } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

/**
 * Résumé d'une série, lu dans la liste des séries (GET /recurrences).
 * @param request Contexte de requête Playwright
 * @param recurrenceId Id de la série
 */
export async function getSeries(request: APIRequestContext, recurrenceId: number): Promise<RecurrenceSummary> {
  const res = await request.get(`${API}/recurrences`)
  expect(res.ok()).toBeTruthy()
  const series = ((await res.json()) as RecurrenceSummary[]).find((item) => item.id === recurrenceId)
  expect(series, `série ${recurrenceId}`).toBeDefined()
  return series as RecurrenceSummary
}
