import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la gestion des tableaux depuis le sélecteur de l'en-tête.
 * Création dans les trois modes de colonnes, nom vide ou déjà pris, renommage
 * en place, couleur, réordonnancement par glisser-déposer, duplication des
 * colonnes, suppression qui archive les tâches, dernier tableau non supprimable.
 *
 * Le tableau par défaut (« Mon tableau », colonnes des seeds) est là à chaque
 * test, « Perso » est créé par POST /boards avec deux colonnes colorées quand
 * le test en a besoin. Les ids se lisent par l'API.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Nom du tableau par défaut en français (seed `00_initial_board.sql`). */
const DEFAULT_BOARD = 'Mon tableau'

/** Colonnes par défaut d'un nouveau tableau en français (`boards.defaultStages` du main). */
const DEFAULT_STAGES = ['A faire', 'En cours', 'En attente', 'Terminé']

/** Second tableau, et ses colonnes. */
const SECOND_BOARD = 'Perso'
const SECOND_STAGES = [
  { name: 'Idées', color: 'amber' },
  { name: 'Fait', color: null },
]

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
  color: string | null
  position: number
  boardId: number
}

/**
 * Tableaux, dans leur ordre.
 * @param request Contexte de requête Playwright
 */
async function apiBoards(request: APIRequestContext): Promise<ApiBoard[]> {
  return (await request.get(`${API}/boards`)).json()
}

/**
 * Colonnes d'un tableau, dans leur ordre.
 * @param request Contexte de requête Playwright
 * @param boardId Id du tableau
 */
async function apiStagesOf(request: APIRequestContext, boardId: number): Promise<ApiStage[]> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
  return stages.filter((stage) => stage.boardId === boardId).sort((a, b) => a.position - b.position || a.id - b.id)
}

/**
 * Tableau désigné par son nom.
 * @param request Contexte de requête Playwright
 * @param name Nom exact
 */
async function apiBoard(request: APIRequestContext, name: string): Promise<ApiBoard | undefined> {
  return (await apiBoards(request)).find((board) => board.name === name)
}

/**
 * Crée le second tableau et ses deux colonnes, et renvoie l'id de sa première colonne.
 * @param request Contexte de requête Playwright
 */
async function createSecondBoard(request: APIRequestContext): Promise<{ boardId: number; stageId: number }> {
  const created = await request.post(`${API}/boards`, {
    data: { name: SECOND_BOARD, color: 'emerald', columns: { mode: 'empty' } },
  })
  expect(created.status(), await created.text()).toBe(201)
  const boardId = ((await created.json()) as { id: number }).id

  const stageIds: number[] = []
  for (const [position, { name, color }] of SECOND_STAGES.entries()) {
    const res = await request.post(`${API}/stages`, { data: { name, position, boardId } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const stage = (await res.json()) as ApiStage
    if (color) {
      const patched = await request.patch(`${API}/stages/${stage.id}`, { data: { color } })
      expect(patched.ok(), await patched.text()).toBeTruthy()
    }
    stageIds.push(stage.id)
  }
  return { boardId, stageId: stageIds[0] }
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
 * Recharge la page et attend le tableau chargé.
 * @param page Page de l'app
 */
async function reload(page: Page) {
  await page.reload()
  await expect(page.getByTestId('board-switcher')).toBeVisible()
}

test.describe('Création d’un tableau', () => {
  test('les colonnes par défaut, copiées ou aucune, le nouveau tableau devient affiché', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    await createSecondBoard(page.request)
    await reload(page)

    // Colonnes par défaut, avec une couleur
    await boardSwitcher.create('Travail', { color: 'sky' })
    await expect.poll(() => taskBoard.stageTitles()).toEqual(DEFAULT_STAGES)
    const work = await apiBoard(page.request, 'Travail')
    expect(work?.color).toBe('sky')
    await expect(boardSwitcher.button.locator('.board-dot')).toHaveAttribute('style', /background-color/)

    // Colonnes copiées d'un autre tableau, noms et couleurs sans les tâches
    await boardSwitcher.create('Perso bis', { mode: 'copy', copyFrom: SECOND_BOARD })
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES.map((stage) => stage.name))
    const copy = await apiBoard(page.request, 'Perso bis')
    expect(copy?.color).toBeNull()
    const copied = await apiStagesOf(page.request, copy!.id)
    expect(copied.map(({ name, color }) => ({ name, color }))).toEqual(SECOND_STAGES)

    // Aucune colonne, seul « Ajouter une liste » reste
    await boardSwitcher.create('Vide', { mode: 'empty' })
    await expect(page.getByTestId('stage-column')).toHaveCount(0)
    await expect(page.getByTestId('btn-add-stage')).toBeVisible()

    // Tableaux ajoutés en dernier
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, SECOND_BOARD, 'Travail', 'Perso bis', 'Vide'])
  })

  test('un nom vide ou déjà pris laisse le dialogue ouvert, Échap l’annule', async ({ page, boardSwitcher }) => {
    await reload(page)
    await boardSwitcher.openCreate()

    // Nom vide, refusé sans appel au serveur
    await boardSwitcher.createName.fill('   ')
    await boardSwitcher.createConfirm.click()
    await expect(boardSwitcher.createNameError).toHaveText('Donne un nom au tableau.')

    // Nom pris sans tenir compte de la casse, refusé par le renderer
    await boardSwitcher.createName.fill('MON TABLEAU')
    await expect(boardSwitcher.createNameError).toBeHidden()
    await page.keyboard.press('Enter')
    await expect(boardSwitcher.createNameError).toHaveText('Un tableau porte déjà ce nom.')

    // Nom pris entre-temps, refusé par le serveur (409)
    const res = await page.request.post(`${API}/boards`, { data: { name: 'Projets', columns: { mode: 'empty' } } })
    expect(res.status(), await res.text()).toBe(201)
    await boardSwitcher.createName.fill('projets')
    await boardSwitcher.createConfirm.click()
    await expect(boardSwitcher.createNameError).toHaveText('Un tableau porte déjà ce nom.')
    await expect(boardSwitcher.createDialog).toBeVisible()

    // Échap annule, rien n'est créé
    await page.keyboard.press('Escape')
    await expect(boardSwitcher.createDialog).toBeHidden()
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    expect((await apiBoards(page.request)).map((board) => board.name)).toEqual([DEFAULT_BOARD, 'Projets'])
  })
})

test.describe('Renommage et couleur', () => {
  test('renommage en place, Échap annule, Entrée enregistre, un nom pris est refusé', async ({
    page,
    boardSwitcher,
  }) => {
    await createSecondBoard(page.request)
    await reload(page)

    // Échap annule, la liste reste ouverte
    await boardSwitcher.startRename(SECOND_BOARD)
    await expect(boardSwitcher.renameInput).toHaveValue(SECOND_BOARD)
    await boardSwitcher.renameInput.fill('Ne pas garder')
    await page.keyboard.press('Escape')
    await expect(boardSwitcher.renameInput).toBeHidden()
    await expect(boardSwitcher.menu).toBeVisible()
    await expect(boardSwitcher.row(SECOND_BOARD)).toBeFocused()

    // Nom vide refusé, le champ reste ouvert
    await boardSwitcher.startRename(SECOND_BOARD)
    await boardSwitcher.renameInput.fill('  ')
    await page.keyboard.press('Enter')
    await expect(boardSwitcher.renameInput).toHaveAttribute('aria-invalid', 'true')

    // Entrée enregistre, toujours dans la liste ouverte
    await boardSwitcher.renameInput.fill('  Maison  ')
    await page.keyboard.press('Enter')
    await expect(boardSwitcher.renameInput).toBeHidden()
    await expect(boardSwitcher.menu).toBeVisible()
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, 'Maison'])
    await expect
      .poll(async () => (await apiBoards(page.request)).map((board) => board.name))
      .toEqual([DEFAULT_BOARD, 'Maison'])

    // Le tableau affiché se renomme aussi, bouton compris
    await boardSwitcher.startRename(DEFAULT_BOARD)
    await boardSwitcher.renameInput.fill('Travail')
    await page.keyboard.press('Enter')
    await expect(boardSwitcher.currentName).toHaveText('Travail')

    // Nom déjà pris (casse ignorée), refusé par le serveur, l'ancien nom revient
    await boardSwitcher.startRename('Maison')
    await boardSwitcher.renameInput.fill('TRAVAIL')
    await page.keyboard.press('Enter')
    await expect(page.locator('.p-toast-message-error')).toContainText('Un tableau porte déjà ce nom.')
    await expect.poll(() => boardSwitcher.names()).toEqual(['Travail', 'Maison'])
  })

  test('la couleur se choisit dans le sous-menu, la liste reste ouverte', async ({ page, boardSwitcher }) => {
    const { boardId } = await createSecondBoard(page.request)
    await reload(page)

    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Couleur').click()
    await boardSwitcher.rowMenuItem('Rose').click()
    await expect(boardSwitcher.rowMenu).toBeHidden()
    await expect(boardSwitcher.menu).toBeVisible()
    await expect.poll(async () => (await apiBoard(page.request, SECOND_BOARD))?.color).toBe('rose')

    // Couleur retirée, pastille vide
    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Couleur').click()
    await boardSwitcher.rowMenuItem('Aucune').click()
    await expect
      .poll(async () => (await apiBoards(page.request)).find((board) => board.id === boardId)?.color)
      .toBeNull()
    await expect(boardSwitcher.row(SECOND_BOARD).locator('.board-dot')).toHaveClass(/empty/)
  })
})

test.describe('Ordre des tableaux', () => {
  test('le glisser-déposer change l’ordre, Ctrl+1 suit le nouvel ordre', async ({ page, taskBoard, boardSwitcher }) => {
    await createSecondBoard(page.request)
    const res = await page.request.post(`${API}/boards`, { data: { name: 'Maison', columns: { mode: 'default' } } })
    expect(res.status(), await res.text()).toBe(201)
    await reload(page)

    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, SECOND_BOARD, 'Maison'])
    await boardSwitcher.dragBefore(SECOND_BOARD, DEFAULT_BOARD)
    await expect.poll(() => boardSwitcher.names()).toEqual([SECOND_BOARD, DEFAULT_BOARD, 'Maison'])
    // Raccourcis affichés dans le nouvel ordre, liste toujours ouverte
    await expect(boardSwitcher.row(SECOND_BOARD).locator('.kb')).toHaveText('Ctrl 1')
    await expect(boardSwitcher.menu).toBeVisible()
    await expect
      .poll(async () => (await apiBoards(page.request)).map((board) => board.name))
      .toEqual([SECOND_BOARD, DEFAULT_BOARD, 'Maison'])

    // Ordre gardé après rechargement, Ctrl+1 affiche le nouveau premier tableau
    await reload(page)
    expect(await boardSwitcher.names()).toEqual([SECOND_BOARD, DEFAULT_BOARD, 'Maison'])
    await page.keyboard.press('Escape')
    await expect(boardSwitcher.menu).toBeHidden()
    await page.keyboard.press('Control+1')
    await boardSwitcher.expectCurrent(SECOND_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES.map((stage) => stage.name))
    await page.keyboard.press('Control+2')
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
  })
})

test.describe('Duplication des colonnes', () => {
  test('le dialogue s’ouvre en copie du tableau, nom numéroté s’il est déjà pris', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    const { stageId } = await createSecondBoard(page.request)
    await createTask(page.request, stageId, 'Tâche à ne pas copier')
    await reload(page)

    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Dupliquer les colonnes').click()
    await expect(boardSwitcher.createDialog).toBeVisible()
    await expect(boardSwitcher.createName).toHaveValue('Perso (copie)')
    await expect(boardSwitcher.createMode('copy')).toHaveClass(/\bon\b/)
    await expect(boardSwitcher.createDialog.getByTestId('board-create-copy-from')).toContainText(SECOND_BOARD)
    await expect(boardSwitcher.createColor('emerald')).toHaveAttribute('aria-pressed', 'true')

    await boardSwitcher.createConfirm.click()
    await expect(boardSwitcher.createDialog).toBeHidden()
    await boardSwitcher.expectCurrent('Perso (copie)')
    await expect.poll(() => taskBoard.stageTitles()).toEqual(SECOND_STAGES.map((stage) => stage.name))
    await expect(taskBoard.taskCard('Tâche à ne pas copier')).toHaveCount(0)
    const copy = await apiBoard(page.request, 'Perso (copie)')
    expect(copy?.color).toBe('emerald')
    expect((await apiStagesOf(page.request, copy!.id)).map(({ name, color }) => ({ name, color }))).toEqual(
      SECOND_STAGES,
    )

    // Seconde copie, nom suivant
    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Dupliquer les colonnes').click()
    await expect(boardSwitcher.createName).toHaveValue('Perso (copie) 2')
  })
})

test.describe('Suppression d’un tableau', () => {
  test('après confirmation, ses tâches sont archivées et le premier tableau restant est affiché', async ({
    page,
    header,
    taskBoard,
    archivesPage,
    boardSwitcher,
  }) => {
    const { boardId, stageId } = await createSecondBoard(page.request)
    await createTask(page.request, stageId, 'Tâche perso')
    await reload(page)
    await boardSwitcher.select(SECOND_BOARD)

    // Annuler garde le tableau, la liste reste ouverte
    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Supprimer').click()
    await expect(taskBoard.confirmPopup).toContainText(
      'Supprimer « Perso » ? Ses 2 colonnes seront supprimées. Sa tâche active sera archivée.',
    )
    await taskBoard.confirmRejectButton.click()
    await expect(taskBoard.confirmPopup).toBeHidden()
    await expect(boardSwitcher.menu).toBeVisible()
    expect(await boardSwitcher.names()).toEqual([DEFAULT_BOARD, SECOND_BOARD])

    // Confirmer supprime le tableau affiché, le premier restant prend sa place
    await boardSwitcher.openRowMenu(SECOND_BOARD)
    await boardSwitcher.rowMenuItem('Supprimer').click()
    await taskBoard.confirmAcceptButton.click()
    await expect(page.locator('.p-toast-message-secondary')).toContainText('Tableau supprimé')
    await expect(page.locator('.p-toast-message-secondary')).toContainText('Sa tâche est dans les archives')
    await expect(boardSwitcher.menu).toBeVisible()
    await expect.poll(() => boardSwitcher.names()).toEqual([DEFAULT_BOARD])
    await boardSwitcher.expectCurrent(DEFAULT_BOARD)
    await expect.poll(() => taskBoard.stageTitles()).not.toContain(SECOND_STAGES[0].name)
    expect((await apiBoards(page.request)).map((board) => board.id)).not.toContain(boardId)

    // Tâche retrouvée dans les archives
    await page.keyboard.press('Escape')
    await header.archivesButton.click()
    await expect(archivesPage.item('Tâche perso')).toBeVisible()
  })

  test('le dernier tableau ne se supprime pas, l’entrée est désactivée avec une infobulle', async ({
    page,
    taskBoard,
    boardSwitcher,
  }) => {
    await reload(page)

    await boardSwitcher.openRowMenu(DEFAULT_BOARD)
    const remove = boardSwitcher.rowMenuItem('Supprimer')
    await expect(remove).toHaveAttribute('aria-disabled', 'true')
    await expect(remove).toHaveAttribute('title', 'Le dernier tableau ne peut pas être supprimé')

    await remove.click({ force: true })
    await expect(taskBoard.confirmPopup).toBeHidden()
    expect((await apiBoards(page.request)).map((board) => board.name)).toEqual([DEFAULT_BOARD])
  })
})
