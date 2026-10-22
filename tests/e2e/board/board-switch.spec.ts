import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { AppSettings } from '../../../src/main/shared/settings.constants'

/**
 * Tests E2E du changement de tableau. Sélecteur de l'en-tête et Ctrl+1 à
 * Ctrl+9, colonnes et cartes du tableau affiché, dernier tableau retrouvé au
 * lancement, repli sur le premier tableau, cache juste après un aller-retour,
 * colonnes repliées propres à chaque tableau, sélecteur absent hors du tableau.
 *
 * Deux tableaux, celui par défaut (« Mon tableau », colonnes des seeds) et
 * « Perso » créé par POST /boards sans colonne, puis garni de deux colonnes à
 * lui. Les ids se lisent par l'API à chaque test.
 *
 * Un rechargement de la page tient lieu de redémarrage, le renderer relit
 * alors les paramètres enregistrés côté main.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Nom du tableau par défaut en français (seed `00_initial_board.sql`). */
const DEFAULT_BOARD = 'Mon tableau'

/** Second tableau, et ses colonnes. */
const SECOND_BOARD = 'Perso'
const SECOND_STAGES = ['Idées', 'Fait']

/** Colonne telle que renvoyée par l'API. */
interface ApiStage {
  id: number
  name: string
  position: number
  boardId: number
}

/** Tableaux créés pour un test. */
interface Boards {
  defaultId: number
  secondId: number
  // Première colonne de chaque tableau
  defaultStageId: number
  secondStageId: number
}

/**
 * Crée le second tableau et ses colonnes, et renvoie les ids utiles.
 * @param request Contexte de requête Playwright
 */
async function createSecondBoard(request: APIRequestContext): Promise<Boards> {
  const created = await request.post(`${API}/boards`, {
    data: { name: SECOND_BOARD, color: 'emerald', columns: { mode: 'empty' } },
  })
  expect(created.status(), await created.text()).toBe(201)
  const secondId = ((await created.json()) as { id: number }).id

  const secondStages: ApiStage[] = []
  for (const [position, name] of SECOND_STAGES.entries()) {
    const res = await request.post(`${API}/stages`, { data: { name, position, boardId: secondId } })
    expect(res.ok(), await res.text()).toBeTruthy()
    secondStages.push(await res.json())
  }

  const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
  const defaultStage = stages
    .filter((stage) => stage.boardId !== secondId)
    .sort((a, b) => a.position - b.position || a.id - b.id)[0]

  return {
    defaultId: defaultStage.boardId,
    secondId,
    defaultStageId: defaultStage.id,
    secondStageId: secondStages[0].id,
  }
}

/**
 * Crée une tâche par POST /tasks, en haut de sa colonne.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 */
async function createTask(request: APIRequestContext, stageId: number, title: string) {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

/**
 * Paramètres enregistrés côté main, lus via le pont du preload.
 * @param page Page de l'app
 */
async function storedSettings(page: Page): Promise<AppSettings> {
  return page.evaluate(() =>
    (globalThis as unknown as { settings: { getAll: () => Promise<AppSettings> } }).settings.getAll(),
  )
}

/**
 * Recharge la page et attend le tableau chargé.
 * @param page Page de l'app
 */
async function reload(page: Page) {
  await page.reload()
  await expect(page.getByTestId('stage-column').first()).toBeVisible()
}

test.describe('Changement de tableau', () => {
  test('le menu puis Ctrl+1 et Ctrl+2 affichent les colonnes et les cartes du tableau choisi', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    const boards = await createSecondBoard(page.request)
    await createTask(page.request, boards.defaultStageId, 'Tâche du tableau par défaut')
    await createTask(page.request, boards.secondStageId, 'Tâche perso')
    await reload(page)

    // Tableau par défaut au lancement, liste des tableaux dans leur ordre avec leur nombre de tâches
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, SECOND_BOARD])
    await expect(boardSwitcher.row(SECOND_BOARD).getByTestId('board-row-count')).toHaveText('1')
    await expect(boardSwitcher.row(DEFAULT_BOARD)).toHaveAttribute('aria-current', 'true')
    await expect(taskBoard.taskCard('Tâche du tableau par défaut')).toBeVisible()
    await expect(taskBoard.taskCard('Tâche perso')).toHaveCount(0)

    // Par le menu
    await boardSwitcher.select(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES)
    await expect(taskBoard.taskCard('Tâche perso')).toBeVisible()
    await expect(taskBoard.taskCard('Tâche du tableau par défaut')).toHaveCount(0)

    // Par le raccourci, sans ouvrir le menu
    await page.keyboard.press('Control+1')
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    await expect(taskBoard.taskCard('Tâche du tableau par défaut')).toBeVisible()
    await expect.poll(() => taskBoard.stageTitles()).not.toContain(SECOND_STAGES[0])

    await page.keyboard.press('Control+2')
    await boardSwitcher.expectCurrent(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES)

    // Sans tableau à ce rang, rien ne change
    await page.keyboard.press('Control+3')
    await boardSwitcher.expectCurrent(SECOND_BOARD)
  })

  test('le menu se parcourt au clavier, Échap le ferme et rend le focus au bouton', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    await createSecondBoard(page.request)
    await reload(page)

    // Focus sur la ligne du tableau affiché à l'ouverture
    await boardSwitcher.open()
    await expect(boardSwitcher.row(DEFAULT_BOARD)).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await expect(boardSwitcher.row(SECOND_BOARD)).toBeFocused()
    // En boucle
    await page.keyboard.press('ArrowDown')
    await expect(boardSwitcher.row(DEFAULT_BOARD)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(boardSwitcher.row(SECOND_BOARD)).toBeFocused()

    // Ctrl+1 ignoré dans le menu ouvert
    await page.keyboard.press('Control+1')
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)

    await page.keyboard.press('Enter')
    await expect(boardSwitcher.menu).toBeHidden()
    await boardSwitcher.expectCurrent(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES)
    await expect(boardSwitcher.button).toBeFocused()

    await boardSwitcher.open()
    await page.keyboard.press('Escape')
    await expect(boardSwitcher.menu).toBeHidden()
    await expect(boardSwitcher.button).toBeFocused()
    await boardSwitcher.expectCurrent(SECOND_BOARD)
  })

  test('le dernier tableau affiché est retrouvé au lancement', async ({ page, boardSwitcher, taskBoard }) => {
    const boards = await createSecondBoard(page.request)
    await reload(page)

    await boardSwitcher.select(SECOND_BOARD)
    await expect.poll(async () => (await storedSettings(page)).lastBoardId).toBe(boards.secondId)

    await reload(page)
    await boardSwitcher.expectCurrent(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES)
  })

  test('le premier tableau est affiché quand le dernier a été supprimé', async ({ page, boardSwitcher, taskBoard }) => {
    const boards = await createSecondBoard(page.request)
    await reload(page)

    await boardSwitcher.select(SECOND_BOARD)
    await expect.poll(async () => (await storedSettings(page)).lastBoardId).toBe(boards.secondId)

    const res = await page.request.delete(`${API}/boards/${boards.secondId}`)
    expect(res.ok(), await res.text()).toBeTruthy()

    await reload(page)
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD])
    await expect.poll(() => taskBoard.stageTitles()).not.toContain(SECOND_STAGES[0])
  })

  test('le tableau garde ses changements après un aller-retour', async ({ page, taskBoard, boardSwitcher }) => {
    const boards = await createSecondBoard(page.request)
    await createTask(page.request, boards.defaultStageId, 'Carte déplacée')
    await createTask(page.request, boards.defaultStageId, 'Carte archivée')
    await reload(page)

    const [first, second] = await taskBoard.stageTitles()

    // Changements faits dans le tableau par défaut, sans rechargement
    await taskBoard.createTask(first, { title: 'Carte créée' })
    await taskBoard.moveCardTo('Carte déplacée', second)
    await taskBoard.archiveTask('Carte archivée')
    await expect(taskBoard.taskCard('Carte archivée')).toHaveCount(0)
    await taskBoard.renameStage(second, 'Colonne renommée')

    // Colonne ajoutée dans le second tableau, rattachée à lui
    await boardSwitcher.select(SECOND_BOARD)
    await taskBoard.addStage('Nouvelle colonne perso')
    await expect.poll(() => taskBoard.stageTitles()).toEqual([...SECOND_STAGES, 'Nouvelle colonne perso'])
    const stages = (await (await page.request.get(`${API}/stages`)).json()) as ApiStage[]
    expect(stages.find((stage) => stage.name === 'Nouvelle colonne perso')?.boardId).toBe(boards.secondId)

    // Retour au tableau par défaut, Kanban reconstruit depuis le cache
    await boardSwitcher.select(DEFAULT_BOARD)
    await expect.poll(() => taskBoard.columnTaskTitles(first)).toContain('Carte créée')
    await expect.poll(() => taskBoard.columnTaskTitles('Colonne renommée')).toEqual(['Carte déplacée'])
    await expect(taskBoard.taskCard('Carte archivée')).toHaveCount(0)
    await expect.poll(() => taskBoard.stageTitles()).not.toContain('Nouvelle colonne perso')

    // Et la nouvelle colonne toujours dans le second tableau
    await boardSwitcher.select(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual([...SECOND_STAGES, 'Nouvelle colonne perso'])
  })

  test("une colonne repliée le reste après un repli dans l'autre tableau", async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    await createSecondBoard(page.request)
    await reload(page)

    const [first] = await taskBoard.stageTitles()
    await taskBoard.collapseStage(first)

    await boardSwitcher.select(SECOND_BOARD)
    await taskBoard.collapseStage(SECOND_STAGES[0])

    await boardSwitcher.select(DEFAULT_BOARD)
    await expect(taskBoard.collapsedColumn(first)).toHaveCount(1)

    // Toujours repliées toutes deux après un redémarrage
    await expect.poll(async () => (await storedSettings(page)).collapsedStageIds).toHaveLength(2)
    await reload(page)
    await expect(taskBoard.collapsedColumn(first)).toHaveCount(1)
    await boardSwitcher.select(SECOND_BOARD)
    await expect(taskBoard.collapsedColumn(SECOND_STAGES[0])).toHaveCount(1)
  })

  test('le sélecteur est absent des pages Checklists, Archives et Paramètres', async ({
    header,
    boardSwitcher,
    checklistsPage,
    archivesPage,
    settingsPage,
  }) => {
    await expect(boardSwitcher.button).toBeVisible()

    await header.goChecklists()
    await checklistsPage.expectVisible()
    await expect(boardSwitcher.button).toHaveCount(0)

    await header.goArchives()
    await archivesPage.expectVisible()
    await expect(boardSwitcher.button).toHaveCount(0)

    await header.goSettings()
    await settingsPage.expectVisible()
    await expect(boardSwitcher.button).toHaveCount(0)

    await header.goHome()
    await expect(boardSwitcher.button).toBeVisible()
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
  })
})
