import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { DEFAULT_BOARD, createBoard, createTaskIn, type ApiStage } from '../../helpers/board.helper'
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

/** Second tableau, et ses colonnes. */
const SECOND_BOARD = 'Perso'
const SECOND_STAGES = ['Idées', 'Fait']

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
  const second = await createBoard(request, SECOND_BOARD, 'emerald', SECOND_STAGES)

  const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
  const defaultStage = stages
    .filter((stage) => stage.boardId !== second.id)
    .sort((a, b) => a.position - b.position || a.id - b.id)[0]

  return {
    defaultId: defaultStage.boardId,
    secondId: second.id,
    defaultStageId: defaultStage.id,
    secondStageId: second.stageIds[0],
  }
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
    await createTaskIn(page.request, boards.defaultStageId, 'Tâche du tableau par défaut')
    await createTaskIn(page.request, boards.secondStageId, 'Tâche perso')
    await reload(page)

    // Tableau par défaut au lancement, liste des tableaux dans leur ordre avec leur nombre de tâches
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, SECOND_BOARD])
    await expect(boardSwitcher.row(SECOND_BOARD).getByTestId('board-row-count')).toHaveText('1')
    await expect(boardSwitcher.rowButton(DEFAULT_BOARD)).toHaveAttribute('aria-current', 'true')
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
    await expect(boardSwitcher.rowButton(DEFAULT_BOARD)).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await expect(boardSwitcher.rowButton(SECOND_BOARD)).toBeFocused()
    // En boucle
    await page.keyboard.press('ArrowDown')
    await expect(boardSwitcher.rowButton(DEFAULT_BOARD)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(boardSwitcher.rowButton(SECOND_BOARD)).toBeFocused()

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
    await createTaskIn(page.request, boards.defaultStageId, 'Carte déplacée')
    await createTaskIn(page.request, boards.defaultStageId, 'Carte archivée')
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

test.describe('Accessibilité du sélecteur', () => {
  test('liste de boutons, sans bouton imbriqué, nom complet au survol d’un nom tronqué', async ({
    page,
    boardSwitcher,
  }) => {
    const longName = 'Un tableau au nom bien trop long pour tenir dans le sélecteur'.slice(0, 60)
    const created = await page.request.post(`${API}/boards`, { data: { name: longName, columns: { mode: 'empty' } } })
    expect(created.status(), await created.text()).toBe(201)
    await reload(page)

    // Bouton qui ouvre un dialogue (le Popover), état ouvert annoncé
    await expect(boardSwitcher.button).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(boardSwitcher.button).toHaveAttribute('aria-expanded', 'false')
    await boardSwitcher.open()
    await expect(boardSwitcher.button).toHaveAttribute('aria-expanded', 'true')

    // Une ligne par tableau dans une liste, sélection et ⋯ côte à côte
    await expect(boardSwitcher.menu.getByRole('list')).toHaveCount(1)
    await expect(boardSwitcher.menu.getByRole('listitem')).toHaveCount(2)
    await expect(boardSwitcher.menu.locator('button button, [role="menuitem"] button')).toHaveCount(0)
    await expect(boardSwitcher.rowButton(DEFAULT_BOARD)).toHaveAttribute('aria-keyshortcuts', 'Control+1')
    await expect(boardSwitcher.rowButton(DEFAULT_BOARD)).toHaveAccessibleName(`${DEFAULT_BOARD} Aucune tâche active`)

    // Nom tronqué, texte complet en infobulle native au survol, rien pour un nom entier
    const rowName = boardSwitcher.row(longName).getByTestId('board-row-name')
    await rowName.hover()
    await expect(rowName).toHaveAttribute('title', longName)
    const shortName = boardSwitcher.row(DEFAULT_BOARD).getByTestId('board-row-name')
    await shortName.hover()
    await expect(shortName).not.toHaveAttribute('title')

    // Bouton du sélecteur sur le tableau au nom long
    await boardSwitcher.select(longName)
    await boardSwitcher.currentName.hover()
    await expect(boardSwitcher.currentName).toHaveAttribute('title', longName)
  })
})
