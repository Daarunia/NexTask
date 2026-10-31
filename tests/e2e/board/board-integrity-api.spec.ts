import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { DAILY, getSeries, localDate, plusMinutes, runRecurrences, seriesTasks } from '../../helpers/recurrence.helper'

/**
 * Tests E2E de la règle d'or des tableaux, tenue par le serveur seul. Une
 * tâche avec une colonne a le tableau de cette colonne, une tâche archivée
 * garde son tableau. Chaque écriture de `stageId` (création, modification,
 * lot, archivage, restauration, duplication, ajout rapide, déplacement, import) est
 * suivie d'une relecture par GET /tasks, et un `boardId` envoyé par le client
 * est ignoré.
 *
 * D'abord avec le seul tableau par défaut, puis avec un second tableau créé
 * par POST /boards (restauration, ajout rapide, séries, déplacement). Les ids
 * changent à chaque reset et se lisent donc par l'API, jamais en dur.
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
  tasks: ApiTask[]
}

/** Tâche telle que renvoyée par l'API. */
interface ApiTask {
  id: number
  title: string
  position: number
  stageId: number | null
  boardId: number | null
  isHistorized: boolean
  recurrenceId: number | null
  // Résumé de la série, null hors série
  recurrence: { id: number; boardId: number | null } | null
}

/** Colonnes triées par position, et leur tableau commun. */
async function layout(request: APIRequestContext): Promise<{ stages: ApiStage[]; boardId: number }> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = ((await res.json()) as ApiStage[]).sort((a, b) => a.position - b.position || a.id - b.id)
  expect(stages.length).toBeGreaterThan(1)
  return { stages, boardId: stages[0].boardId }
}

/**
 * Crée une tâche par POST /tasks.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 * @param extra Champs en plus du corps (un `boardId` du client par exemple)
 */
async function createTask(
  request: APIRequestContext,
  stageId: number,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<ApiTask> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.5.0', description: '', ...extra },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ApiTask
}

/** Relit une tâche dans GET /tasks, la route des archives et du tableau. */
async function listedTask(request: APIRequestContext, id: number): Promise<ApiTask> {
  const res = await request.get(`${API}/tasks`)
  expect(res.ok()).toBeTruthy()
  const task = ((await res.json()) as ApiTask[]).find((t) => t.id === id)
  expect(task, `tâche ${id} absente de GET /tasks`).toBeDefined()
  return task as ApiTask
}

/**
 * Enregistre le dernier tableau affiché, comme le fera le renderer.
 * @param page Fenêtre de l'app, qui porte le pont des paramètres
 * @param boardId Id du tableau, ou null
 */
async function setLastBoard(page: Page, boardId: number | null): Promise<void> {
  await page.evaluate((id) => (globalThis as any).settings.set('lastBoardId', id), boardId)
}

test.describe('Colonnes', () => {
  test('GET /stages expose le tableau de chaque colonne et de chaque tâche', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)
    await createTask(page.request, stages[1].id, 'Exposée')

    const res = await page.request.get(`${API}/stages`)
    const listed = (await res.json()) as ApiStage[]
    expect(boardId).toEqual(expect.any(Number))
    for (const stage of listed) expect(stage.boardId).toBe(boardId)
    const tasks = listed.flatMap((stage) => stage.tasks)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ title: 'Exposée', boardId })
  })

  test('POST /stages prend le tableau demandé, sinon le premier, et refuse un tableau inconnu', async ({ page }) => {
    const { boardId } = await layout(page.request)

    const byDefault = await page.request.post(`${API}/stages`, { data: { name: 'Par défaut', position: 9 } })
    expect(byDefault.ok()).toBeTruthy()
    expect(await byDefault.json()).toMatchObject({ name: 'Par défaut', boardId })

    const explicit = await page.request.post(`${API}/stages`, { data: { name: 'Demandé', position: 10, boardId } })
    expect(explicit.ok()).toBeTruthy()
    expect(await explicit.json()).toMatchObject({ name: 'Demandé', boardId })

    const unknown = await page.request.post(`${API}/stages`, {
      data: { name: 'Perdue', position: 11, boardId: UNKNOWN_ID },
    })
    expect(unknown.status()).toBe(404)
    const names = ((await (await page.request.get(`${API}/stages`)).json()) as ApiStage[]).map((s) => s.name)
    expect(names).not.toContain('Perdue')
  })

  test('PATCH /stages/:id ignore un boardId envoyé', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)

    const res = await page.request.patch(`${API}/stages/${stages[0].id}`, {
      data: { name: 'Renommée', boardId: UNKNOWN_ID },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: stages[0].id, name: 'Renommée', boardId })
  })
})

test.describe('Écritures de la colonne d’une tâche', () => {
  test('POST /tasks prend le tableau de la colonne, ignore un boardId envoyé, 404 sur une colonne inconnue', async ({
    page,
  }) => {
    const { stages, boardId } = await layout(page.request)

    const task = await createTask(page.request, stages[1].id, 'Créée', { boardId: UNKNOWN_ID })
    expect(task).toMatchObject({ stageId: stages[1].id, boardId })
    expect(await listedTask(page.request, task.id)).toMatchObject({ stageId: stages[1].id, boardId })

    const unknown = await page.request.post(`${API}/tasks`, {
      data: { stageId: UNKNOWN_ID, position: 0, title: 'Perdue', version: '1.5.0', description: '', tags: ['neuf'] },
    })
    expect(unknown.status()).toBe(404)
    // Rien n'est écrit, pas même le tag
    const titles = ((await (await page.request.get(`${API}/tasks`)).json()) as ApiTask[]).map((t) => t.title)
    expect(titles).toEqual(['Créée'])
    expect(await (await page.request.get(`${API}/tags`)).json()).toEqual([])
  })

  test('PATCH /tasks/:id fait suivre le tableau, le garde à l’archivage et refuse une colonne inconnue', async ({
    page,
  }) => {
    const { stages, boardId } = await layout(page.request)
    const task = await createTask(page.request, stages[0].id, 'Modifiée')

    // Changement de colonne, boardId du client ignoré
    const moved = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { stageId: stages[2].id, position: 0, boardId: UNKNOWN_ID },
    })
    expect(moved.ok(), await moved.text()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({ stageId: stages[2].id, boardId })

    // boardId seul, sans colonne, ignoré lui aussi
    const alone = await page.request.patch(`${API}/tasks/${task.id}`, { data: { boardId: UNKNOWN_ID } })
    expect(alone.ok(), await alone.text()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({ boardId })

    // Colonne inconnue : 404, tâche inchangée
    const unknown = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { stageId: UNKNOWN_ID, title: 'Jamais' },
    })
    expect(unknown.status()).toBe(404)
    expect(await listedTask(page.request, task.id)).toMatchObject({ title: 'Modifiée', stageId: stages[2].id })

    // Archivage : la colonne part, le tableau reste
    const archived = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { stageId: null, isHistorized: true },
    })
    expect(archived.ok(), await archived.text()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({ stageId: null, isHistorized: true, boardId })
  })

  test('PATCH /tasks/batch fait suivre le tableau ligne par ligne, une colonne inconnue annule le lot', async ({
    page,
  }) => {
    const { stages, boardId } = await layout(page.request)
    const first = await createTask(page.request, stages[0].id, 'Lot 1')
    const second = await createTask(page.request, stages[0].id, 'Lot 2')

    const res = await page.request.patch(`${API}/tasks/batch`, {
      data: [
        { id: first.id, stageId: stages[1].id, position: 0, boardId: UNKNOWN_ID },
        { id: second.id, stageId: null, isHistorized: true },
      ],
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toEqual([
      expect.objectContaining({ id: first.id, stageId: stages[1].id, boardId }),
      expect.objectContaining({ id: second.id, stageId: null, boardId }),
    ])
    expect(await listedTask(page.request, first.id)).toMatchObject({ stageId: stages[1].id, boardId })
    expect(await listedTask(page.request, second.id)).toMatchObject({ stageId: null, isHistorized: true, boardId })

    const unknown = await page.request.patch(`${API}/tasks/batch`, {
      data: [
        { id: first.id, stageId: stages[2].id, position: 0 },
        { id: second.id, stageId: UNKNOWN_ID, isHistorized: false, position: 0 },
      ],
    })
    expect(unknown.status()).toBe(500)
    // Toute la transaction est annulée, la première ligne comprise
    expect(await listedTask(page.request, first.id)).toMatchObject({ stageId: stages[1].id })
  })

  test('archivage par PUT /tasks/:id et par suppression de la colonne : le tableau reste', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)
    const single = await createTask(page.request, stages[0].id, 'Archivée seule')
    const withStage = await createTask(page.request, stages[3].id, 'Archivée avec sa colonne')

    expect((await page.request.put(`${API}/tasks/${single.id}`)).ok()).toBeTruthy()
    expect((await page.request.delete(`${API}/stages/${stages[3].id}`)).ok()).toBeTruthy()

    for (const id of [single.id, withStage.id]) {
      expect(await listedTask(page.request, id)).toMatchObject({ stageId: null, isHistorized: true, boardId })
    }
  })

  test('POST /tasks/:id/duplicate copie le tableau de la source', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)
    const source = await createTask(page.request, stages[1].id, 'Source')

    const res = await page.request.post(`${API}/tasks/${source.id}/duplicate`, { data: { title: 'Copie' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const copy = (await res.json()) as ApiTask
    expect(await listedTask(page.request, copy.id)).toMatchObject({ stageId: stages[1].id, boardId })
  })
})

test.describe('Restauration', () => {
  test('sans place, première colonne du tableau de la tâche ; à sa place, tableau de la colonne', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)
    const byDefault = await createTask(page.request, stages[2].id, 'Par défaut')
    const inPlace = await createTask(page.request, stages[2].id, 'À sa place')
    for (const task of [byDefault, inPlace]) {
      expect((await page.request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    }

    // Tableau de repli inconnu : sans effet, la tâche a encore son tableau
    const restored = await page.request.post(`${API}/tasks/${byDefault.id}/restore?boardId=${UNKNOWN_ID}`)
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await listedTask(page.request, byDefault.id)).toMatchObject({
      stageId: stages[0].id,
      boardId,
      isHistorized: false,
    })

    const placed = await page.request.post(`${API}/tasks/${inPlace.id}/restore?stageId=${stages[2].id}&position=0`)
    expect(placed.ok(), await placed.text()).toBeTruthy()
    expect(await listedTask(page.request, inPlace.id)).toMatchObject({ stageId: stages[2].id, position: 0, boardId })
  })

  test('409 quand le tableau de la tâche, seul tableau, n’a plus aucune colonne', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)
    const task = await createTask(page.request, stages[0].id, 'Sans colonne')
    for (const stage of stages) {
      expect((await page.request.delete(`${API}/stages/${stage.id}`)).ok()).toBeTruthy()
    }

    const res = await page.request.post(`${API}/tasks/${task.id}/restore`)
    expect(res.status()).toBe(409)
    expect(await listedTask(page.request, task.id)).toMatchObject({ isHistorized: true, stageId: null, boardId })

    // Une colonne recréée dans ce tableau reçoit la tâche
    const created = await page.request.post(`${API}/stages`, { data: { name: 'Nouvelle', position: 0, boardId } })
    const stage = (await created.json()) as ApiStage
    expect((await page.request.post(`${API}/tasks/${task.id}/restore`)).ok()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({ stageId: stage.id, boardId })
  })
})

test.describe('Ajout rapide', () => {
  /**
   * Ajoute une tâche par POST /tasks/quick-add.
   * @param request Contexte de requête Playwright
   * @param data Titre et colonne éventuelle
   */
  async function quickAdd(request: APIRequestContext, data: { title: string; stageId?: number }): Promise<ApiTask> {
    const res = await request.post(`${API}/tasks/quick-add`, { data })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()) as ApiTask
  }

  test('colonne demandée, sinon première colonne du dernier tableau affiché ou du premier', async ({ page }) => {
    const { stages, boardId } = await layout(page.request)

    const chosen = await quickAdd(page.request, { title: 'Choisie', stageId: stages[2].id })
    expect(await listedTask(page.request, chosen.id)).toMatchObject({ stageId: stages[2].id, boardId })

    // Aucun dernier tableau connu (paramètre par défaut)
    const unset = await quickAdd(page.request, { title: 'Sans paramètre' })
    expect(await listedTask(page.request, unset.id)).toMatchObject({ stageId: stages[0].id, boardId })

    // Dernier tableau affiché
    await setLastBoard(page, boardId)
    const last = await quickAdd(page.request, { title: 'Dernier tableau', stageId: UNKNOWN_ID })
    expect(await listedTask(page.request, last.id)).toMatchObject({ stageId: stages[0].id, boardId })

    // Dernier tableau disparu : repli sur le premier
    await setLastBoard(page, UNKNOWN_ID)
    const gone = await quickAdd(page.request, { title: 'Tableau disparu' })
    expect(await listedTask(page.request, gone.id)).toMatchObject({ stageId: stages[0].id, boardId })
  })
})

/**
 * Crée un tableau par POST /boards, et renvoie son id et ses colonnes triées.
 * @param request Contexte de requête Playwright
 * @param name Nom du tableau
 * @param mode Colonnes du tableau, les quatre par défaut ou aucune
 */
async function createBoard(
  request: APIRequestContext,
  name: string,
  mode: 'default' | 'empty' = 'default',
): Promise<{ boardId: number; stages: ApiStage[] }> {
  const res = await request.post(`${API}/boards`, { data: { name, columns: { mode } } })
  expect(res.status(), await res.text()).toBe(201)
  const board = (await res.json()) as { id: number; stages: ApiStage[] }
  return { boardId: board.id, stages: board.stages }
}

/**
 * Crée une tâche récurrente quotidienne, à partir de demain, par POST /tasks.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche, et du modèle de sa série
 * @param title Titre
 */
async function createRecurring(request: APIRequestContext, stageId: number, title: string): Promise<ApiTask> {
  return createTask(request, stageId, title, { startDate: localDate(1).toISOString(), recurrence: DAILY })
}

test.describe('Second tableau', () => {
  test('restauration sans place : première colonne du tableau d’origine, pas du premier tableau', async ({ page }) => {
    const first = await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const task = await createTask(page.request, second.stages[2].id, 'Revient chez elle')
    expect((await page.request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({ stageId: null, boardId: second.boardId })

    // Le tableau de repli ne sert pas, la tâche a encore son tableau
    const res = await page.request.post(`${API}/tasks/${task.id}/restore?boardId=${first.boardId}`)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await listedTask(page.request, task.id)).toMatchObject({
      stageId: second.stages[0].id,
      boardId: second.boardId,
      isHistorized: false,
    })
  })

  test('restauration d’une tâche au tableau supprimé : tableau de ?boardId=, sinon le premier', async ({ page }) => {
    const first = await layout(page.request)
    const target = await createBoard(page.request, 'Cible')
    const doomed = await createBoard(page.request, 'Supprimé')
    const withFallback = await createTask(page.request, doomed.stages[1].id, 'Avec repli')
    const withoutFallback = await createTask(page.request, doomed.stages[1].id, 'Sans repli')
    const gone = await createTask(page.request, doomed.stages[1].id, 'Repli disparu')

    expect((await page.request.delete(`${API}/boards/${doomed.boardId}`)).ok()).toBeTruthy()
    for (const task of [withFallback, withoutFallback, gone]) {
      expect(await listedTask(page.request, task.id)).toMatchObject({ isHistorized: true, boardId: null })
    }

    const restored = await page.request.post(`${API}/tasks/${withFallback.id}/restore?boardId=${target.boardId}`)
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await listedTask(page.request, withFallback.id)).toMatchObject({
      stageId: target.stages[0].id,
      boardId: target.boardId,
    })

    expect((await page.request.post(`${API}/tasks/${withoutFallback.id}/restore`)).ok()).toBeTruthy()
    expect(await listedTask(page.request, withoutFallback.id)).toMatchObject({
      stageId: first.stages[0].id,
      boardId: first.boardId,
    })

    // Tableau de repli disparu lui aussi : premier tableau
    const fallbackGone = await page.request.post(`${API}/tasks/${gone.id}/restore?boardId=${doomed.boardId}`)
    expect(fallbackGone.ok(), await fallbackGone.text()).toBeTruthy()
    expect(await listedTask(page.request, gone.id)).toMatchObject({
      stageId: first.stages[0].id,
      boardId: first.boardId,
    })
  })

  test('restauration sans place, tableau de la tâche sans colonne : tableau de ?boardId=, sinon le premier', async ({
    page,
  }) => {
    const first = await layout(page.request)
    const emptied = await createBoard(page.request, 'Vidé')
    const shown = await createBoard(page.request, 'Affiché')
    const empty = await createBoard(page.request, 'Vide', 'empty')
    const withFallback = await createTask(page.request, emptied.stages[1].id, 'Avec repli')
    const withoutFallback = await createTask(page.request, emptied.stages[1].id, 'Sans repli')
    const emptyFallback = await createTask(page.request, emptied.stages[1].id, 'Repli vide')

    // Colonnes supprimées : tâches archivées, le tableau existe encore et reste le leur
    for (const stage of emptied.stages) {
      expect((await page.request.delete(`${API}/stages/${stage.id}`)).ok()).toBeTruthy()
    }
    for (const task of [withFallback, withoutFallback, emptyFallback]) {
      expect(await listedTask(page.request, task.id)).toMatchObject({ isHistorized: true, boardId: emptied.boardId })
    }

    // Tableau de l'interface plutôt qu'un 409
    const restored = await page.request.post(`${API}/tasks/${withFallback.id}/restore?boardId=${shown.boardId}`)
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await listedTask(page.request, withFallback.id)).toMatchObject({
      stageId: shown.stages[0].id,
      boardId: shown.boardId,
      isHistorized: false,
    })

    expect((await page.request.post(`${API}/tasks/${withoutFallback.id}/restore`)).ok()).toBeTruthy()
    expect(await listedTask(page.request, withoutFallback.id)).toMatchObject({
      stageId: first.stages[0].id,
      boardId: first.boardId,
    })

    // Tableau de l'interface sans colonne lui aussi : premier tableau
    const emptyShown = await page.request.post(`${API}/tasks/${emptyFallback.id}/restore?boardId=${empty.boardId}`)
    expect(emptyShown.ok(), await emptyShown.text()).toBeTruthy()
    expect(await listedTask(page.request, emptyFallback.id)).toMatchObject({
      stageId: first.stages[0].id,
      boardId: first.boardId,
    })
  })

  test('ajout rapide : première colonne du dernier tableau affiché, premier tableau s’il est vide', async ({
    page,
  }) => {
    const first = await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const empty = await createBoard(page.request, 'Vide', 'empty')
    const quickAdd = async (data: { title: string; stageId?: number }) => {
      const res = await page.request.post(`${API}/tasks/quick-add`, { data })
      expect(res.ok(), await res.text()).toBeTruthy()
      return listedTask(page.request, ((await res.json()) as ApiTask).id)
    }

    await setLastBoard(page, second.boardId)
    expect(await quickAdd({ title: 'Vers le second' })).toMatchObject({
      stageId: second.stages[0].id,
      boardId: second.boardId,
    })

    // Colonne explicite d'un autre tableau que le dernier affiché
    expect(await quickAdd({ title: 'Choisie', stageId: first.stages[1].id })).toMatchObject({
      stageId: first.stages[1].id,
      boardId: first.boardId,
    })

    // Dernier tableau sans colonne : premier tableau (choix du lot 2, plutôt qu'un 409)
    await setLastBoard(page, empty.boardId)
    expect(await quickAdd({ title: 'Repli' })).toMatchObject({ stageId: first.stages[0].id, boardId: first.boardId })
  })

  test('la série garde le tableau de sa tâche, même après la suppression de la colonne du modèle', async ({ page }) => {
    await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const origin = await createRecurring(page.request, second.stages[2].id, 'Série du second')
    expect(origin.recurrence).toMatchObject({ boardId: second.boardId })
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({ boardId: second.boardId })

    // Colonne du modèle supprimée : l'occurrence naît dans la première colonne du même tableau
    expect((await page.request.delete(`${API}/stages/${second.stages[2].id}`)).ok()).toBeTruthy()
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, next] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(next).toMatchObject({ stageId: second.stages[0].id, boardId: second.boardId })
  })

  test('PATCH /tasks/:id vers un autre tableau : la série suit, PATCH /tasks/batch : elle reste', async ({ page }) => {
    const first = await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const single = await createRecurring(page.request, first.stages[0].id, 'Seule')
    const batched = await createRecurring(page.request, first.stages[0].id, 'En lot')

    const patched = await page.request.patch(`${API}/tasks/${single.id}`, {
      data: { stageId: second.stages[1].id, position: 0 },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    expect(await listedTask(page.request, single.id)).toMatchObject({
      stageId: second.stages[1].id,
      boardId: second.boardId,
      recurrence: { boardId: second.boardId },
    })

    const batch = await page.request.patch(`${API}/tasks/batch`, {
      data: [{ id: batched.id, stageId: second.stages[1].id, position: 1 }],
    })
    expect(batch.ok(), await batch.text()).toBeTruthy()
    expect(await listedTask(page.request, batched.id)).toMatchObject({
      stageId: second.stages[1].id,
      boardId: second.boardId,
      recurrence: { boardId: first.boardId },
    })
  })

  test('duplication et déplacement : tableau de la colonne, boardId envoyé ignoré', async ({ page }) => {
    const first = await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const source = await createTask(page.request, second.stages[1].id, 'Source')

    const duplicated = await page.request.post(`${API}/tasks/${source.id}/duplicate`, {
      data: { title: 'Copie', boardId: first.boardId },
    })
    expect(duplicated.ok(), await duplicated.text()).toBeTruthy()
    const copy = (await duplicated.json()) as ApiTask
    expect(await listedTask(page.request, copy.id)).toMatchObject({
      stageId: second.stages[1].id,
      boardId: second.boardId,
    })

    const moved = await page.request.post(`${API}/tasks/${copy.id}/move`, {
      data: { stageId: first.stages[2].id, boardId: second.boardId },
    })
    expect(moved.ok(), await moved.text()).toBeTruthy()
    expect(await listedTask(page.request, copy.id)).toMatchObject({
      stageId: first.stages[2].id,
      boardId: first.boardId,
    })
  })
})

test.describe('Import', () => {
  /** Ligne du fichier d'export qui porte un tableau. */
  interface ExportedRow {
    id: number
    title: string
    stageId: number | null
    boardId: number | null
  }

  test('le tableau d’une tâche ou d’une série à colonne vient de sa colonne, jamais du fichier', async ({ page }) => {
    const first = await layout(page.request)
    const second = await createBoard(page.request, 'Second')
    const active = await createTask(page.request, second.stages[1].id, 'Active')
    const recurring = await createRecurring(page.request, second.stages[0].id, 'Récurrente')
    const lost = await createTask(page.request, second.stages[0].id, 'Tableau perdu')
    const kept = await createTask(page.request, first.stages[0].id, 'Tableau gardé')
    for (const task of [lost, kept]) expect((await page.request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()

    const exported = await (await page.request.get(`${API}/data/export`)).json()
    // Fichier retouché, tableaux faux pour les lignes qui ont une colonne, inconnu pour une archive
    const lie = (row: ExportedRow) => {
      if (row.id === lost.id) return { ...row, boardId: UNKNOWN_ID }
      return row.stageId === null ? row : { ...row, boardId: first.boardId }
    }
    const file = {
      ...exported,
      tasks: (exported.tasks as ExportedRow[]).map(lie),
      recurrences: (exported.recurrences as ExportedRow[]).map(lie),
    }
    const res = await page.request.post(`${API}/data/import`, { data: file })
    expect(res.ok(), await res.text()).toBeTruthy()

    expect(await listedTask(page.request, active.id)).toMatchObject({ boardId: second.boardId })
    expect(await listedTask(page.request, recurring.id)).toMatchObject({
      boardId: second.boardId,
      recurrence: { boardId: second.boardId },
    })
    expect(await listedTask(page.request, lost.id)).toMatchObject({ isHistorized: true, boardId: null })
    expect(await listedTask(page.request, kept.id)).toMatchObject({ isHistorized: true, boardId: first.boardId })
  })
})
