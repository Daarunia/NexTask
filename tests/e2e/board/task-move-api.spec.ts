import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  DAILY,
  createRecurringTask,
  getSeries,
  getTask,
  localDate,
  plusMinutes,
  runRecurrences,
  seriesTasks,
  setSeriesStatus,
  type RecurringTask,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E du déplacement d'une tâche (POST /tasks/:id/move), vers une autre
 * colonne de son tableau ou vers un autre tableau. En bas de la colonne ou à
 * une position, série en cours qui suit la tâche dans son nouveau tableau,
 * aller-retour qui rend l'état de départ, refus.
 *
 * Deux tableaux, celui par défaut (A) et un second créé par POST /boards (B),
 * dont les ids se lisent par l'API à chaque test.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// API pure : pas de rechargement de la page après le reset
test.use({ ui: false })

/** Id qui ne désigne aucune ligne de la base. */
const UNKNOWN_ID = 999999

/** Colonne telle que renvoyée par GET /stages. */
interface ApiStage {
  id: number
  name: string
  position: number
  boardId: number
}

/** Un tableau et ses colonnes, dans l'ordre d'affichage. */
interface Layout {
  boardId: number
  stages: ApiStage[]
}

/**
 * Tableau par défaut (A) et second tableau (B) créé avec les colonnes par
 * défaut, chacun avec ses colonnes triées.
 * @param request Contexte de requête Playwright
 */
async function twoBoards(request: APIRequestContext): Promise<{ a: Layout; b: Layout }> {
  const created = await request.post(`${API}/boards`, { data: { name: 'Second', columns: { mode: 'default' } } })
  expect(created.status(), await created.text()).toBe(201)
  const boardB = (await created.json()) as { id: number }

  const res = await request.get(`${API}/stages`)
  const stages = ((await res.json()) as ApiStage[]).sort((x, y) => x.position - y.position || x.id - y.id)
  const of = (boardId: number) => ({ boardId, stages: stages.filter((stage) => stage.boardId === boardId) })
  const a = of(stages.find((stage) => stage.boardId !== boardB.id)!.boardId)
  const b = of(boardB.id)
  expect(a.stages).toHaveLength(4)
  expect(b.stages).toHaveLength(4)
  return { a, b }
}

/**
 * Crée une tâche simple par POST /tasks.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 * @param position Position dans la colonne
 */
async function createTask(
  request: APIRequestContext,
  stageId: number,
  title: string,
  position: number,
): Promise<RecurringTask> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position, title, version: '1.5.0', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

/**
 * Déplace une tâche par POST /tasks/:id/move, et renvoie la réponse.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 * @param data Colonne visée et position éventuelle
 */
async function move(request: APIRequestContext, id: number, data: Record<string, unknown>): Promise<RecurringTask> {
  const res = await request.post(`${API}/tasks/${id}/move`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

/**
 * Titres des tâches actives d'une colonne, par position.
 * @param request Contexte de requête Playwright
 * @param stageId Id de la colonne
 */
async function titlesIn(request: APIRequestContext, stageId: number): Promise<string[]> {
  const res = await request.get(`${API}/tasks?isHistorized=false`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as RecurringTask[])
    .filter((task) => task.stageId === stageId)
    .sort((x, y) => x.position - y.position)
    .map((task) => task.title)
}

test.describe('Déplacement', () => {
  test('vers un autre tableau, en bas de la colonne par défaut', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createTask(page.request, a.stages[0].id, 'Voyageuse', 0)
    await createTask(page.request, b.stages[0].id, 'B1', 0)
    await createTask(page.request, b.stages[0].id, 'B2', 1)

    const moved = await move(page.request, task.id, { stageId: b.stages[0].id })
    expect(moved).toMatchObject({ id: task.id, stageId: b.stages[0].id, boardId: b.boardId, position: 2 })
    // Réponse complète, comme les autres routes des tâches
    expect(moved).toMatchObject({ tags: [], checklist: null, recurrence: null })

    expect(await getTask(page.request, task.id)).toMatchObject({ stageId: b.stages[0].id, boardId: b.boardId })
    expect(await titlesIn(page.request, b.stages[0].id)).toEqual(['B1', 'B2', 'Voyageuse'])
    expect(await titlesIn(page.request, a.stages[0].id)).toEqual([])
  })

  test('à une position, les tâches suivantes descendent d’un cran', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createTask(page.request, a.stages[1].id, 'Insérée', 0)
    await createTask(page.request, b.stages[2].id, 'B1', 0)
    await createTask(page.request, b.stages[2].id, 'B2', 1)

    const moved = await move(page.request, task.id, { stageId: b.stages[2].id, position: 1 })
    expect(moved).toMatchObject({ stageId: b.stages[2].id, boardId: b.boardId, position: 1 })
    expect(await titlesIn(page.request, b.stages[2].id)).toEqual(['B1', 'Insérée', 'B2'])
  })

  test('dans son tableau, la tâche change de colonne sans toucher à sa série', async ({ page }) => {
    const { a } = await twoBoards(page.request)
    const task = await createRecurringTask(page.request, {
      title: 'Locale',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: a.stages[0].id,
    })

    const moved = await move(page.request, task.id, { stageId: a.stages[2].id })
    expect(moved).toMatchObject({ stageId: a.stages[2].id, boardId: a.boardId })

    // La prochaine occurrence naît dans la colonne du modèle, inchangée
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, next] = await seriesTasks(page.request, task.recurrenceId!)
    expect(next).toMatchObject({ stageId: a.stages[0].id, boardId: a.boardId })
  })
})

test.describe('Série', () => {
  test('la série en cours suit la tâche, ses occurrences suivantes naissent dans le nouveau tableau', async ({
    page,
  }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createRecurringTask(page.request, {
      title: 'Hebdo',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: a.stages[0].id,
    })
    expect(task.recurrence).toMatchObject({ boardId: a.boardId })

    const moved = await move(page.request, task.id, { stageId: b.stages[1].id })
    expect(moved.recurrence).toMatchObject({ boardId: b.boardId, status: 'active' })
    expect(await getSeries(page.request, task.recurrenceId!)).toMatchObject({ boardId: b.boardId })

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, next] = await seriesTasks(page.request, task.recurrenceId!)
    expect(next).toMatchObject({ stageId: b.stages[1].id, boardId: b.boardId, isHistorized: false })
  })

  test('une série terminée ne suit pas', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createRecurringTask(page.request, {
      title: 'Finie',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: a.stages[0].id,
    })
    await setSeriesStatus(page.request, task.recurrenceId!, 'ended')

    const moved = await move(page.request, task.id, { stageId: b.stages[0].id })
    expect(moved).toMatchObject({ boardId: b.boardId })
    expect(moved.recurrence).toMatchObject({ status: 'ended', boardId: a.boardId })
  })

  test('aller-retour : la tâche reprend sa place et la série son tableau', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    await createTask(page.request, a.stages[0].id, 'Avant', 0)
    const task = await createRecurringTask(page.request, {
      title: 'Aller-retour',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: a.stages[0].id,
      position: 1,
    })
    await createTask(page.request, a.stages[0].id, 'Après', 2)
    const before = await getTask(page.request, task.id)

    const there = await move(page.request, task.id, { stageId: b.stages[0].id })
    expect(there).toMatchObject({ boardId: b.boardId, recurrence: { boardId: b.boardId } })

    // Annulation : ancienne colonne et ancienne position
    const back = await move(page.request, task.id, { stageId: before.stageId, position: before.position })
    expect(back).toMatchObject({
      stageId: before.stageId,
      boardId: before.boardId,
      position: before.position,
      recurrenceId: before.recurrenceId,
    })
    expect(back.recurrence).toEqual(before.recurrence)
    expect(await titlesIn(page.request, a.stages[0].id)).toEqual(['Avant', 'Aller-retour', 'Après'])
    expect(await titlesIn(page.request, b.stages[0].id)).toEqual([])

    // La prochaine occurrence naît de nouveau dans la colonne de départ
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, next] = await seriesTasks(page.request, task.recurrenceId!)
    expect(next).toMatchObject({ stageId: a.stages[0].id, boardId: a.boardId })
  })
})

test.describe('Refus', () => {
  test('404 sur une tâche ou une colonne inconnue, 409 sur une tâche archivée, 400 sans colonne', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createTask(page.request, a.stages[0].id, 'Immobile', 0)
    const archived = await createTask(page.request, a.stages[0].id, 'Archivée', 1)
    expect((await page.request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()

    const status = async (id: number, data: Record<string, unknown>) =>
      (await page.request.post(`${API}/tasks/${id}/move`, { data })).status()

    expect(await status(UNKNOWN_ID, { stageId: b.stages[0].id })).toBe(404)
    expect(await status(task.id, { stageId: UNKNOWN_ID })).toBe(404)
    expect(await status(archived.id, { stageId: b.stages[0].id })).toBe(409)
    expect(await status(task.id, {})).toBe(400)
    expect(await status(task.id, { stageId: b.stages[0].id, position: -1 })).toBe(400)

    // Rien n'a bougé
    expect(await getTask(page.request, task.id)).toMatchObject({ stageId: a.stages[0].id, boardId: a.boardId })
    expect(await getTask(page.request, archived.id)).toMatchObject({
      stageId: null,
      boardId: a.boardId,
      isHistorized: true,
    })
  })

  test('un boardId envoyé est ignoré, le tableau est celui de la colonne', async ({ page }) => {
    const { a, b } = await twoBoards(page.request)
    const task = await createTask(page.request, a.stages[0].id, 'Têtue', 0)

    const moved = await move(page.request, task.id, { stageId: b.stages[0].id, boardId: a.boardId })
    expect(moved).toMatchObject({ stageId: b.stages[0].id, boardId: b.boardId })
  })
})
