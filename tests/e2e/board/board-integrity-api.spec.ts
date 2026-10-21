import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la règle d'or des tableaux, tenue par le serveur seul. Une
 * tâche avec une colonne a le tableau de cette colonne, une tâche archivée
 * garde son tableau. Chaque écriture de `stageId` (création, modification,
 * lot, archivage, restauration, duplication, ajout rapide) est suivie d'une
 * relecture par GET /tasks, et un `boardId` envoyé par le client est ignoré.
 *
 * Ici avec le seul tableau par défaut, dont l'id change à chaque reset et se
 * lit donc sur les colonnes (GET /stages), jamais en dur.
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

  test('409 quand le tableau de la tâche n’a plus aucune colonne', async ({ page }) => {
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
