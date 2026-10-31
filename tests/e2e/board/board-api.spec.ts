import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { BOARD_NAME_MAX_LENGTH } from '../../../src/main/shared/board.constants'

/**
 * Tests E2E de l'API des tableaux (GET, POST, PATCH, DELETE /boards).
 * Création dans les trois modes de colonnes, unicité du nom sans tenir compte
 * de la casse, renommage, couleur, réordonnancement, et suppression qui
 * archive les tâches et termine les séries.
 *
 * Les ids de tableau changent à chaque reset, ils se lisent donc par l'API
 * (GET /boards), jamais en dur.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// API pure : pas de rechargement de la page après le reset
test.use({ ui: false })

/** Id qui ne désigne aucune ligne de la base. */
const UNKNOWN_ID = 999999

/** Noms des colonnes par défaut, en français (langue forcée en mode test). */
const DEFAULT_STAGES = ['A faire', 'En cours', 'En attente', 'Terminé']

/** Tableau tel que renvoyé par l'API. */
interface ApiBoard {
  id: number
  name: string
  color: string | null
  position: number
}

/** Colonne telle que renvoyée par l'API. */
interface ApiStage {
  id: number
  name: string
  position: number
  color: string | null
  boardId: number
  tasks: ApiTask[]
}

/** Tâche telle que renvoyée par l'API. */
interface ApiTask {
  id: number
  title: string
  stageId: number | null
  boardId: number | null
  isHistorized: boolean
  historizationDate: string | null
  recurrenceId: number | null
}

/** Série telle que listée par GET /recurrences. */
interface ApiSeries {
  id: number
  status: string
  nextRunAt: string | null
  boardId: number | null
}

/** Tableaux, dans l'ordre de GET /boards. */
async function listBoards(request: APIRequestContext): Promise<ApiBoard[]> {
  const res = await request.get(`${API}/boards`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as ApiBoard[]
}

/** Seul tableau d'une base remise à zéro. */
async function defaultBoard(request: APIRequestContext): Promise<ApiBoard> {
  const boards = await listBoards(request)
  expect(boards).toHaveLength(1)
  return boards[0]
}

/**
 * Crée un tableau par POST /boards.
 * @param request Contexte de requête Playwright
 * @param data Corps de la requête
 */
async function createBoard(
  request: APIRequestContext,
  data: { name: string; color?: string | null; columns: { mode: string; fromBoardId?: number } },
): Promise<ApiBoard & { stages: ApiStage[] }> {
  const res = await request.post(`${API}/boards`, { data })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

/**
 * Colonnes d'un tableau, dans l'ordre d'affichage.
 * @param request Contexte de requête Playwright
 * @param boardId Id du tableau
 */
async function stagesOf(request: APIRequestContext, boardId: number): Promise<ApiStage[]> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as ApiStage[])
    .filter((stage) => stage.boardId === boardId)
    .sort((a, b) => a.position - b.position || a.id - b.id)
}

/**
 * Crée une tâche par POST /tasks.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 * @param extra Champs en plus du corps (une règle de répétition par exemple)
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
  return res.json()
}

/** Toutes les tâches, archivées comprises, par id. */
async function tasksById(request: APIRequestContext): Promise<Map<number, ApiTask>> {
  const res = await request.get(`${API}/tasks`)
  expect(res.ok()).toBeTruthy()
  return new Map(((await res.json()) as ApiTask[]).map((task) => [task.id, task]))
}

/** Séries, par id. */
async function seriesById(request: APIRequestContext): Promise<Map<number, ApiSeries>> {
  const res = await request.get(`${API}/recurrences`)
  expect(res.ok()).toBeTruthy()
  return new Map(((await res.json()) as ApiSeries[]).map((series) => [series.id, series]))
}

/** Demain à 9 h, en heure locale. */
function tomorrow(): Date {
  const date = new Date()
  date.setHours(9, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return date
}

test.describe('Création', () => {
  test('GET /boards renvoie le tableau par défaut', async ({ page }) => {
    const board = await defaultBoard(page.request)
    expect(board).toEqual({ id: expect.any(Number), name: 'Mon tableau', color: null, position: 0 })
  })

  test('mode default : quatre colonnes traduites, tableau placé en dernier', async ({ page }) => {
    const first = await defaultBoard(page.request)

    const created = await createBoard(page.request, { name: '  Perso  ', color: 'rose', columns: { mode: 'default' } })
    expect(created).toMatchObject({ name: 'Perso', color: 'rose', position: first.position + 1 })
    expect(created.stages.map((stage) => stage.name)).toEqual(DEFAULT_STAGES)
    expect(created.stages.every((stage) => stage.boardId === created.id && stage.tasks.length === 0)).toBe(true)

    expect((await listBoards(page.request)).map((board) => board.name)).toEqual(['Mon tableau', 'Perso'])
    expect((await stagesOf(page.request, created.id)).map((stage) => stage.name)).toEqual(DEFAULT_STAGES)
    // Les colonnes du premier tableau ne bougent pas
    expect(await stagesOf(page.request, first.id)).toHaveLength(4)
  })

  test('mode copy : noms, couleurs et ordre des colonnes, sans les tâches', async ({ page }) => {
    const source = await defaultBoard(page.request)
    const [first, second] = await stagesOf(page.request, source.id)
    await page.request.patch(`${API}/stages/${second.id}`, { data: { color: 'teal' } })
    // Inversion des deux premières colonnes
    await page.request.patch(`${API}/stages/batch`, {
      data: [
        { id: first.id, position: second.position },
        { id: second.id, position: first.position },
      ],
    })
    await createTask(page.request, first.id, 'Reste dans la source')
    const expected = (await stagesOf(page.request, source.id)).map(({ name, color }) => ({ name, color }))

    const copy = await createBoard(page.request, { name: 'Copie', columns: { mode: 'copy', fromBoardId: source.id } })
    expect(copy.color).toBeNull()
    expect(copy.stages.map(({ name, color }) => ({ name, color }))).toEqual(expected)
    expect(copy.stages.flatMap((stage) => stage.tasks)).toEqual([])
    expect((await stagesOf(page.request, copy.id)).map(({ name, color }) => ({ name, color }))).toEqual(expected)

    // fromBoardId ignoré hors mode copy
    const empty = await createBoard(page.request, {
      name: 'Vide',
      columns: { mode: 'empty', fromBoardId: source.id },
    })
    expect(empty.stages).toEqual([])
    expect(await stagesOf(page.request, empty.id)).toEqual([])
  })

  test('refus : nom pris en changeant la casse, nom vide ou trop long, copie sans source', async ({ page }) => {
    const reject = async (data: Record<string, unknown>, status: number) => {
      const res = await page.request.post(`${API}/boards`, { data })
      expect(res.status(), JSON.stringify(data)).toBe(status)
    }

    await reject({ name: 'MON TABLEAU', columns: { mode: 'empty' } }, 409)
    await reject({ name: '  mon tableau ', columns: { mode: 'default' } }, 409)
    await reject({ name: '   ', columns: { mode: 'empty' } }, 400)
    await reject({ name: 'x'.repeat(BOARD_NAME_MAX_LENGTH + 1), columns: { mode: 'empty' } }, 400)
    await reject({ name: 'Sans colonnes' }, 400)
    await reject({ name: 'Mode inconnu', columns: { mode: 'all' } }, 400)
    await reject({ name: 'Couleur inconnue', color: 'black', columns: { mode: 'empty' } }, 400)
    await reject({ name: 'Copie', columns: { mode: 'copy' } }, 400)
    await reject({ name: 'Copie', columns: { mode: 'copy', fromBoardId: UNKNOWN_ID } }, 404)

    // Rien n'a été créé, ni tableau ni colonne
    expect(await listBoards(page.request)).toHaveLength(1)
    expect(((await (await page.request.get(`${API}/stages`)).json()) as ApiStage[]).length).toBe(4)

    // Nom de longueur maximale accepté
    await createBoard(page.request, { name: 'x'.repeat(BOARD_NAME_MAX_LENGTH), columns: { mode: 'empty' } })
  })
})

test.describe('Modification', () => {
  test('renommage nettoyé, changement de casse de son propre nom, 409 sur le nom d’un autre', async ({ page }) => {
    const first = await defaultBoard(page.request)
    const other = await createBoard(page.request, { name: 'Perso', columns: { mode: 'empty' } })

    const renamed = await page.request.patch(`${API}/boards/${other.id}`, { data: { name: '  Maison ' } })
    expect(renamed.ok(), await renamed.text()).toBeTruthy()
    expect(await renamed.json()).toEqual({ id: other.id, name: 'Maison', color: null, position: other.position })

    const recased = await page.request.patch(`${API}/boards/${other.id}`, { data: { name: 'MAISON' } })
    expect(recased.ok(), await recased.text()).toBeTruthy()
    expect(await recased.json()).toMatchObject({ name: 'MAISON' })

    const taken = await page.request.patch(`${API}/boards/${other.id}`, { data: { name: 'mon TABLEAU' } })
    expect(taken.status()).toBe(409)
    // Le nom libéré par un renommage se reprend
    expect((await page.request.patch(`${API}/boards/${first.id}`, { data: { name: 'Travail' } })).ok()).toBeTruthy()
    expect((await page.request.patch(`${API}/boards/${other.id}`, { data: { name: 'Mon tableau' } })).ok()).toBeTruthy()
    expect((await listBoards(page.request)).map((board) => board.name)).toEqual(['Travail', 'Mon tableau'])
  })

  test('couleur posée puis retirée, refus des corps invalides et d’un tableau inconnu', async ({ page }) => {
    const board = await defaultBoard(page.request)

    const colored = await page.request.patch(`${API}/boards/${board.id}`, { data: { color: 'violet' } })
    expect(await colored.json()).toMatchObject({ name: 'Mon tableau', color: 'violet' })
    const cleared = await page.request.patch(`${API}/boards/${board.id}`, { data: { color: null } })
    expect(await cleared.json()).toMatchObject({ color: null })

    // Un champ non déclaré est ignoré, jamais écrit
    const extra = await page.request.patch(`${API}/boards/${board.id}`, { data: { name: 'Gardé', position: 42 } })
    expect(await extra.json()).toMatchObject({ name: 'Gardé', position: board.position })

    for (const data of [{}, { name: '  ' }, { color: 'black' }, { name: 'x'.repeat(BOARD_NAME_MAX_LENGTH + 1) }]) {
      const res = await page.request.patch(`${API}/boards/${board.id}`, { data })
      expect(res.status(), JSON.stringify(data)).toBe(400)
    }
    expect((await page.request.patch(`${API}/boards/${UNKNOWN_ID}`, { data: { name: 'Perdu' } })).status()).toBe(404)
  })

  test('réordonnancement par lot, un id inconnu annule tout le lot', async ({ page }) => {
    const first = await defaultBoard(page.request)
    const second = await createBoard(page.request, { name: 'Deuxième', columns: { mode: 'empty' } })
    const third = await createBoard(page.request, { name: 'Troisième', columns: { mode: 'empty' } })

    const res = await page.request.patch(`${API}/boards/batch`, {
      data: [
        { id: third.id, position: 0 },
        { id: first.id, position: 1 },
        { id: second.id, position: 2 },
      ],
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(((await res.json()) as ApiBoard[]).map((board) => board.id)).toEqual([third.id, first.id, second.id])
    expect((await listBoards(page.request)).map((board) => board.name)).toEqual([
      'Troisième',
      'Mon tableau',
      'Deuxième',
    ])

    const unknown = await page.request.patch(`${API}/boards/batch`, {
      data: [
        { id: second.id, position: 0 },
        { id: UNKNOWN_ID, position: 1 },
      ],
    })
    expect(unknown.status()).toBe(400)
    expect((await page.request.patch(`${API}/boards/batch`, { data: [] })).status()).toBe(400)
    expect((await listBoards(page.request)).map((board) => board.name)).toEqual([
      'Troisième',
      'Mon tableau',
      'Deuxième',
    ])

    // Un tableau créé ensuite va après le plus grand rang
    const fourth = await createBoard(page.request, { name: 'Quatrième', columns: { mode: 'empty' } })
    expect(fourth.position).toBe(3)
  })
})

test.describe('Suppression', () => {
  const DAILY = { frequency: 'daily', interval: 1, endType: 'never', skipIfPending: false }

  test('archive les tâches actives, termine les séries, laisse les archives sans tableau', async ({ page }) => {
    const kept = await defaultBoard(page.request)
    const [keptStage] = await stagesOf(page.request, kept.id)
    const doomed = await createBoard(page.request, { name: 'À supprimer', columns: { mode: 'default' } })
    const [todo, doing] = doomed.stages

    const active = await createTask(page.request, todo.id, 'Active')
    const other = await createTask(page.request, doing.id, 'Autre colonne')
    const recurring = await createTask(page.request, todo.id, 'Récurrente', {
      startDate: tomorrow().toISOString(),
      recurrence: DAILY,
    })
    const archivedBefore = await createTask(page.request, doing.id, 'Déjà archivée')
    expect((await page.request.put(`${API}/tasks/${archivedBefore.id}`)).ok()).toBeTruthy()
    // Tâche et série d'un autre tableau, intactes
    const outside = await createTask(page.request, keptStage.id, 'Ailleurs', {
      startDate: tomorrow().toISOString(),
      recurrence: DAILY,
    })

    const res = await page.request.delete(`${API}/boards/${doomed.id}`)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toEqual({ message: expect.any(String), archived: 3 })

    expect(await listBoards(page.request)).toEqual([kept])
    expect(await stagesOf(page.request, doomed.id)).toEqual([])

    const tasks = await tasksById(page.request)
    for (const task of [active, other, recurring, archivedBefore]) {
      expect(tasks.get(task.id), task.title).toMatchObject({
        isHistorized: true,
        stageId: null,
        boardId: null,
        historizationDate: expect.any(String),
      })
    }
    expect(tasks.get(outside.id)).toMatchObject({ isHistorized: false, stageId: keptStage.id, boardId: kept.id })

    const series = await seriesById(page.request)
    expect(series.get(recurring.recurrenceId as number)).toMatchObject({
      status: 'ended',
      nextRunAt: null,
      boardId: null,
    })
    expect(series.get(outside.recurrenceId as number)).toMatchObject({ status: 'active', boardId: kept.id })
  })

  test('409 sur le dernier tableau, 404 sur un tableau inconnu', async ({ page }) => {
    const board = await defaultBoard(page.request)
    const [stage] = await stagesOf(page.request, board.id)
    const task = await createTask(page.request, stage.id, 'Reste au tableau')

    expect((await page.request.delete(`${API}/boards/${board.id}`)).status()).toBe(409)
    expect((await page.request.delete(`${API}/boards/${UNKNOWN_ID}`)).status()).toBe(404)

    // Rien n'a bougé
    expect(await listBoards(page.request)).toEqual([board])
    expect((await tasksById(page.request)).get(task.id)).toMatchObject({ isHistorized: false, stageId: stage.id })

    // Une fois un autre tableau créé, le premier se supprime, et le second devient le dernier
    const other = await createBoard(page.request, { name: 'Second', columns: { mode: 'empty' } })
    expect((await page.request.delete(`${API}/boards/${board.id}`)).ok()).toBeTruthy()
    expect((await page.request.delete(`${API}/boards/${other.id}`)).status()).toBe(409)
  })
})
