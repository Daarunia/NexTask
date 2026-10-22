import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  DAILY,
  createRecurringTask,
  localDate,
  plusMinutes,
  runRecurrences,
  seriesTasks,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de l'envoi d'une tâche vers un autre tableau, par l'entrée
 * « Autre tableau » du menu de carte. Carte arrivée en bas de la première
 * colonne de l'autre tableau, tableau sans colonne grisé, annulation par le
 * toast (et par Ctrl+Z depuis l'autre tableau), série qui suit la tâche,
 * colonne disparue entre-temps, entrée absente avec un seul tableau, et
 * en-tête « Tableau · Colonne » du dialogue de tâche.
 *
 * Le tableau par défaut (« Mon tableau », colonnes des seeds) est là à chaque
 * test. « Perso » est créé par POST /boards avec deux colonnes à lui, « Vide »
 * sans colonne. Les ids se lisent par l'API.
 *
 * Isolation, base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Nom du tableau par défaut en français (seed `00_initial_board.sql`). */
const DEFAULT_BOARD = 'Mon tableau'

/** Première colonne du tableau par défaut (seed `01_initial_stages.sql`). */
const DEFAULT_COLUMN = 'A faire'

/** Second tableau, et ses colonnes. */
const SECOND_BOARD = 'Perso'
const SECOND_STAGES = ['Idées', 'Fait']

/** Tableau sans colonne. */
const EMPTY_BOARD = 'Vide'

/** Colonne telle que renvoyée par l'API. */
interface ApiStage {
  id: number
  name: string
  position: number
  boardId: number
}

/** Tâche telle que renvoyée par l'API. */
interface ApiTask {
  id: number
  title: string
  position: number
  stageId: number | null
  boardId: number | null
}

/** Tableaux créés pour un test. */
interface Boards {
  defaultId: number
  secondId: number
  defaultStageId: number // première colonne du tableau par défaut
  secondStageIds: number[] // colonnes de « Perso », dans l'ordre
}

/**
 * Crée un tableau par POST /boards et renvoie son id.
 * @param request Contexte de requête Playwright
 * @param name Nom du tableau
 * @param color Couleur de la palette, null sans couleur
 */
async function createBoard(request: APIRequestContext, name: string, color: string | null): Promise<number> {
  const res = await request.post(`${API}/boards`, { data: { name, color, columns: { mode: 'empty' } } })
  expect(res.status(), await res.text()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

/**
 * Crée « Perso » et ses colonnes, au besoin « Vide », et renvoie les ids utiles.
 * @param request Contexte de requête Playwright
 * @param withEmpty Vrai pour créer aussi le tableau sans colonne
 */
async function createBoards(request: APIRequestContext, withEmpty = false): Promise<Boards> {
  const secondId = await createBoard(request, SECOND_BOARD, 'emerald')
  if (withEmpty) await createBoard(request, EMPTY_BOARD, null)

  const secondStageIds: number[] = []
  for (const [position, name] of SECOND_STAGES.entries()) {
    const res = await request.post(`${API}/stages`, { data: { name, position, boardId: secondId } })
    expect(res.ok(), await res.text()).toBeTruthy()
    secondStageIds.push(((await res.json()) as ApiStage).id)
  }

  const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
  const defaultStage = stages.find((stage) => stage.name === DEFAULT_COLUMN && stage.boardId !== secondId)!

  return { defaultId: defaultStage.boardId, secondId, defaultStageId: defaultStage.id, secondStageIds }
}

/**
 * Crée les tâches données, dans l'ordre, dans une colonne.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne des tâches
 * @param titles Titres des tâches
 */
async function createTasks(request: APIRequestContext, stageId: number, ...titles: string[]) {
  for (const [position, title] of titles.entries()) {
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

/**
 * Tâches actives, par GET /tasks.
 * @param request Contexte de requête Playwright
 */
async function activeTasks(request: APIRequestContext): Promise<ApiTask[]> {
  return (await request.get(`${API}/tasks?isHistorized=false`)).json()
}

/**
 * Titres des tâches actives d'une colonne en base, dans l'ordre des positions.
 * @param request Contexte de requête Playwright
 * @param stageId Id de la colonne
 */
async function savedTitles(request: APIRequestContext, stageId: number): Promise<string[]> {
  return (await activeTasks(request))
    .filter((task) => task.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title)
}

/**
 * Tâche active par son titre.
 * @param request Contexte de requête Playwright
 * @param title Titre exact
 */
async function taskByTitle(request: APIRequestContext, title: string): Promise<ApiTask> {
  return (await activeTasks(request)).find((task) => task.title === title)!
}

test.describe('Envoi vers un autre tableau', () => {
  test('le menu de carte envoie la tâche en bas de la première colonne du tableau choisi', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    const boards = await createBoards(page.request, true)
    await createTasks(page.request, boards.defaultStageId, 'Voyageuse', 'Reste')
    await createTasks(page.request, boards.secondStageIds[0], 'Déjà là')
    await page.reload()

    // Entrée juste après « Déplacer vers », une ligne par autre tableau, le tableau sans colonne grisé
    await taskBoard.openCardMenu('Voyageuse')
    const names = await taskBoard.cardMenu
      .locator('[role="menuitem"][aria-level="1"]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
    expect(names.slice(names.indexOf('Déplacer vers'), names.indexOf('Déplacer vers') + 2)).toEqual([
      'Déplacer vers',
      'Autre tableau',
    ])
    await taskBoard.cardMenuItem('Autre tableau').hover()
    await expect(taskBoard.cardMenuItem(SECOND_BOARD)).toBeVisible()
    await expect(taskBoard.cardMenuItem(SECOND_BOARD).locator('[data-annex]')).toHaveAttribute(
      'data-annex',
      SECOND_STAGES[0],
    )
    await expect(taskBoard.cardMenuItem(EMPTY_BOARD)).toHaveAttribute('aria-disabled', 'true')
    await expect(taskBoard.cardMenuItem(EMPTY_BOARD).locator('[data-annex]')).toHaveAttribute(
      'data-annex',
      'sans colonne',
    )
    await expect(taskBoard.cardMenuItem(DEFAULT_BOARD)).toHaveCount(0)

    await taskBoard.cardMenuItem(SECOND_BOARD).click()
    await expect(taskBoard.cardMenu).toBeHidden()

    // La carte quitte le tableau affiché, le compteur du sélecteur suit
    await expect(taskBoard.taskCard('Voyageuse')).toHaveCount(0)
    await expect(taskBoard.taskCard('Reste')).toBeVisible()
    await boardSwitcher.open()
    await expect(boardSwitcher.row(SECOND_BOARD).getByTestId('board-row-count')).toHaveText('2')
    await expect(boardSwitcher.row(DEFAULT_BOARD).getByTestId('board-row-count')).toHaveText('1')

    // En bas de la première colonne de « Perso », en base comme à l'écran
    expect(await savedTitles(page.request, boards.secondStageIds[0])).toEqual(['Déjà là', 'Voyageuse'])
    expect(await taskByTitle(page.request, 'Voyageuse')).toMatchObject({ boardId: boards.secondId })
    await boardSwitcher.select(SECOND_BOARD)
    await expect.poll(() => taskBoard.columnTaskTitles(SECOND_STAGES[0])).toEqual(['Déjà là', 'Voyageuse'])
  })

  test('le toast annule l’envoi, la carte reprend sa place', async ({ page, taskBoard, undoToast, boardSwitcher }) => {
    const boards = await createBoards(page.request)
    await createTasks(page.request, boards.defaultStageId, 'Un', 'Voyageuse', 'Trois')
    await page.reload()

    await taskBoard.openCardMenu('Voyageuse')
    await taskBoard.cardMenuItem('Autre tableau').hover()
    await taskBoard.cardMenuItem(SECOND_BOARD).click()

    const toast = undoToast.toast('Voyageuse')
    await expect(toast.getByTestId('undo-toast-summary')).toHaveText(`Tâche envoyée vers ${SECOND_BOARD}`)
    await expect(taskBoard.taskCard('Voyageuse')).toHaveCount(0)

    await undoToast.undo('Voyageuse')
    await expect.poll(() => taskBoard.columnTaskTitles(DEFAULT_COLUMN)).toEqual(['Un', 'Voyageuse', 'Trois'])
    expect(await savedTitles(page.request, boards.defaultStageId)).toEqual(['Un', 'Voyageuse', 'Trois'])
    expect(await taskByTitle(page.request, 'Voyageuse')).toMatchObject({ boardId: boards.defaultId })
    await boardSwitcher.open()
    await expect(boardSwitcher.row(SECOND_BOARD).getByTestId('board-row-count')).toHaveText('0')
  })

  test('Ctrl+Z depuis le tableau d’arrivée ramène la carte et le tableau d’origine', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    const boards = await createBoards(page.request)
    await createTasks(page.request, boards.defaultStageId, 'Voyageuse', 'Reste')
    await page.reload()

    await taskBoard.openCardMenu('Voyageuse')
    await taskBoard.cardMenuItem('Autre tableau').hover()
    await taskBoard.cardMenuItem(SECOND_BOARD).click()
    await expect(taskBoard.taskCard('Voyageuse')).toHaveCount(0)

    // Sur « Perso », la carte est arrivée, puis l'annulation la renvoie
    await page.keyboard.press('Control+2')
    await boardSwitcher.expectCurrent(SECOND_BOARD)
    await expect(taskBoard.taskCard('Voyageuse')).toBeVisible()

    await page.keyboard.press('Control+z')
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    await expect.poll(() => taskBoard.columnTaskTitles(DEFAULT_COLUMN)).toEqual(['Voyageuse', 'Reste'])
    expect(await savedTitles(page.request, boards.defaultStageId)).toEqual(['Voyageuse', 'Reste'])
    expect(await savedTitles(page.request, boards.secondStageIds[0])).toEqual([])
  })

  test('la série suit la tâche, son occurrence suivante naît dans le nouveau tableau', async ({ page, taskBoard }) => {
    const boards = await createBoards(page.request)
    const task = await createRecurringTask(page.request, {
      title: 'Quotidienne',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: boards.defaultStageId,
    })
    await page.reload()

    await taskBoard.openCardMenu('Quotidienne')
    await taskBoard.cardMenuItem('Autre tableau').hover()
    await taskBoard.cardMenuItem(SECOND_BOARD).click()
    await expect(taskBoard.taskCard('Quotidienne')).toHaveCount(0)
    await expect.poll(async () => (await taskByTitle(page.request, 'Quotidienne')).boardId).toBe(boards.secondId)

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, next] = await seriesTasks(page.request, task.recurrenceId!)
    expect(next).toMatchObject({ stageId: boards.secondStageIds[0], boardId: boards.secondId, isHistorized: false })
  })

  test('une colonne disparue entre-temps laisse la carte en place, avec un toast d’erreur', async ({
    page,
    taskBoard,
  }) => {
    const boards = await createBoards(page.request)
    await createTasks(page.request, boards.defaultStageId, 'Voyageuse')
    await page.reload()
    await expect(taskBoard.taskCard('Voyageuse')).toBeVisible()

    // Colonne supprimée par l'API une fois le tableau chargé, le renderer la croit encore là
    const res = await page.request.delete(`${API}/stages/${boards.secondStageIds[0]}`)
    expect(res.ok(), await res.text()).toBeTruthy()

    await taskBoard.openCardMenu('Voyageuse')
    await taskBoard.cardMenuItem('Autre tableau').hover()
    await taskBoard.cardMenuItem(SECOND_BOARD).click()

    await expect(page.locator('.p-toast-message-error')).toContainText('Tâche non envoyée')
    await expect(taskBoard.taskCard('Voyageuse')).toBeVisible()
    expect(await taskByTitle(page.request, 'Voyageuse')).toMatchObject({ boardId: boards.defaultId })
  })

  test('avec un seul tableau, le menu de carte n’a pas d’entrée « Autre tableau »', async ({ page, taskBoard }) => {
    const stages = (await (await page.request.get(`${API}/stages`)).json()) as ApiStage[]
    await createTasks(page.request, stages.find((stage) => stage.name === DEFAULT_COLUMN)!.id, 'Seule')
    await page.reload()

    await taskBoard.openCardMenu('Seule')
    await expect(taskBoard.cardMenuItem('Déplacer vers')).toBeVisible()
    await expect(taskBoard.cardMenuItem('Autre tableau')).toHaveCount(0)
  })
})

test.describe('En-tête du dialogue de tâche', () => {
  test('affiche « Tableau · Colonne » avec plusieurs tableaux, la colonne seule sinon', async ({ page, taskBoard }) => {
    const stages = (await (await page.request.get(`${API}/stages`)).json()) as ApiStage[]
    await createTasks(page.request, stages.find((stage) => stage.name === DEFAULT_COLUMN)!.id, 'Tâche')
    await page.reload()

    const heading = page.getByTestId('task-dialog-heading')
    await taskBoard.openEditDialog('Tâche')
    await expect(heading).toContainText(`Modifier la tâche · ${DEFAULT_COLUMN}`)
    await expect(page.getByTestId('task-dialog-board')).toHaveCount(0)
    await taskBoard.discardDialog()

    await createBoard(page.request, SECOND_BOARD, 'emerald')
    await page.reload()
    await taskBoard.openEditDialog('Tâche')
    await expect(heading).toContainText(`Modifier la tâche · ${DEFAULT_BOARD} · ${DEFAULT_COLUMN}`)
    await expect(page.getByTestId('task-dialog-board')).toHaveText(DEFAULT_BOARD)
  })
})
