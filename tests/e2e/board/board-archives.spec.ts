import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { DEFAULT_BOARD, createBoard, createTaskIn, defaultBoardId } from '../../helpers/board.helper'

/**
 * Tests E2E des archives avec plusieurs tableaux. Tableau de chaque ligne,
 * filtre par tableau, restauration dans le tableau d'origine sans changer le
 * tableau affiché, « Restaurer ici » pour une tâche d'un tableau supprimé,
 * filtre remis à tous les tableaux quand son choix disparaît, message d'un
 * tableau sans colonne, et page inchangée avec un seul tableau.
 *
 * Le tableau par défaut (« Mon tableau », colonnes des seeds) est là à chaque
 * test, les autres sont créés par POST /boards. Les ids se lisent par l'API.
 *
 * Isolation, base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Première colonne du tableau par défaut (seed `01_initial_stages.sql`). */
const DEFAULT_COLUMN = 'A faire'

/** Tâche telle que renvoyée par l'API. */
interface ApiTask {
  id: number
  title: string
  stageId: number | null
  boardId: number | null
  isHistorized: boolean
}

/**
 * Crée une tâche dans une colonne puis l'archive, comme le bouton corbeille.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 * @returns Id de la tâche
 */
async function createArchived(request: APIRequestContext, stageId: number, title: string): Promise<number> {
  const id = await createTaskIn(request, stageId, title)
  expect((await request.put(`${API}/tasks/${id}`)).ok()).toBeTruthy()
  return id
}

/**
 * Id de la première colonne du tableau par défaut.
 * @param request Contexte de requête Playwright
 */
async function defaultStageId(request: APIRequestContext): Promise<number> {
  const boardId = await defaultBoardId(request)
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string; boardId: number }[]
  return stages.find((stage) => stage.name === DEFAULT_COLUMN && stage.boardId === boardId)!.id
}

/**
 * Tâche lue par l'API.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 */
async function getTask(request: APIRequestContext, id: number): Promise<ApiTask> {
  return (await request.get(`${API}/tasks/${id}`)).json()
}

test('chaque ligne montre son tableau, le filtre réduit la liste à un tableau', async ({
  page,
  header,
  archivesPage,
}) => {
  const perso = await createBoard(page.request, 'Perso', 'emerald', ['Idées'])
  await createArchived(page.request, await defaultStageId(page.request), 'Migrer la base')
  await createArchived(page.request, perso.stageIds[0], 'Changer les ampoules')
  // Tableau créé par l'API, relu par le renderer
  await page.reload()

  await header.goArchives()
  await expect(archivesPage.items).toHaveCount(2)
  await expect(archivesPage.boardOf('Migrer la base')).toHaveText(DEFAULT_BOARD)
  await expect(archivesPage.boardOf('Changer les ampoules')).toHaveText('Perso')

  await archivesPage.filterByBoard('Perso')
  await expect.poll(() => archivesPage.titleList()).toEqual(['Changer les ampoules'])
  await expect(archivesPage.count).toHaveText('1/2')

  // Aucune tâche de ce tableau ne contient le texte cherché
  await archivesPage.search.fill('base')
  await expect(archivesPage.noMatch).toHaveText('Aucune tâche archivée ne correspond à la recherche.')

  await archivesPage.search.fill('')
  await archivesPage.filterByBoard('Tous les tableaux')
  await expect(archivesPage.items).toHaveCount(2)
  await expect(archivesPage.count).toHaveText('2')
})

test("la restauration ramène la tâche dans son tableau d'origine, sans changer le tableau affiché", async ({
  page,
  header,
  archivesPage,
  boardSwitcher,
  taskBoard,
}) => {
  const perso = await createBoard(page.request, 'Perso', 'emerald', ['Idées'])
  const id = await createArchived(page.request, perso.stageIds[0], 'Changer les ampoules')
  await page.reload()

  await header.goArchives()
  await expect(archivesPage.restoreButton('Changer les ampoules')).toHaveText('Restaurer')
  await archivesPage.restore('Changer les ampoules')
  await expect(archivesPage.items).toHaveCount(0)
  expect(await getTask(page.request, id)).toMatchObject({
    isHistorized: false,
    stageId: perso.stageIds[0],
    boardId: perso.id,
  })

  await header.goHome()
  await boardSwitcher.expectCurrent(DEFAULT_BOARD)
  await boardSwitcher.select('Perso')
  await expect.poll(() => taskBoard.columnTaskTitles('Idées')).toEqual(['Changer les ampoules'])
})

test("une tâche d'un tableau supprimé se restaure ici, dans le tableau affiché", async ({
  page,
  header,
  archivesPage,
  boardSwitcher,
  taskBoard,
}) => {
  const ancien = await createBoard(page.request, 'Ancien', 'orange', ['Idées'])
  const maison = await createBoard(page.request, 'Maison', 'sky', ['Courses', 'Travaux'])
  const id = await createArchived(page.request, ancien.stageIds[0], 'Ancienne idée de voyage')
  await createArchived(page.request, maison.stageIds[1], 'Repeindre la porte')
  expect((await page.request.delete(`${API}/boards/${ancien.id}`)).ok()).toBeTruthy()

  await page.reload()
  await boardSwitcher.select('Maison')
  await header.goArchives()

  await expect(archivesPage.boardOf('Ancienne idée de voyage')).toHaveText('Tableau supprimé')
  await archivesPage.filterByBoard('Tableau supprimé')
  await expect.poll(() => archivesPage.titleList()).toEqual(['Ancienne idée de voyage'])

  await expect(archivesPage.restoreButton('Ancienne idée de voyage')).toHaveText('Restaurer ici')
  await expect(archivesPage.restoreButton('Ancienne idée de voyage')).toHaveAccessibleName(
    'Restaurer Ancienne idée de voyage dans « Maison »',
  )
  await archivesPage.restore('Ancienne idée de voyage')
  // Option « Tableau supprimé » disparue avec sa dernière tâche : le filtre revient à tous les tableaux
  await expect.poll(() => archivesPage.titleList()).toEqual(['Repeindre la porte'])
  expect(await getTask(page.request, id)).toMatchObject({
    isHistorized: false,
    stageId: maison.stageIds[0],
    boardId: maison.id,
  })

  await header.goHome()
  await boardSwitcher.expectCurrent('Maison')
  await expect.poll(() => taskBoard.columnTaskTitles('Courses')).toEqual(['Ancienne idée de voyage'])
})

test('le filtre « Tableau supprimé » revient à tous les tableaux quand sa dernière tâche est restaurée', async ({
  page,
  header,
  archivesPage,
  boardSwitcher,
}) => {
  const ancien = await createBoard(page.request, 'Ancien', 'orange', ['Idées'])
  const maison = await createBoard(page.request, 'Maison', 'sky', ['Courses'])
  await createArchived(page.request, ancien.stageIds[0], 'Ancienne idée de voyage')
  await createArchived(page.request, maison.stageIds[0], 'Repeindre la porte')
  expect((await page.request.delete(`${API}/boards/${ancien.id}`)).ok()).toBeTruthy()

  await page.reload()
  await boardSwitcher.select('Maison')
  await header.goArchives()

  await archivesPage.filterByBoard('Tableau supprimé')
  await expect.poll(() => archivesPage.titleList()).toEqual(['Ancienne idée de voyage'])

  // Choix disparu avec la dernière tâche du tableau supprimé, filtre remis à « Tous les tableaux »
  await archivesPage.restore('Ancienne idée de voyage')
  await expect(archivesPage.boardFilter).toContainText('Tous les tableaux')
  await expect.poll(() => archivesPage.titleList()).toEqual(['Repeindre la porte'])
  await expect(archivesPage.count).toHaveText('1')
  await expect(archivesPage.noMatch).toHaveCount(0)

  await archivesPage.boardFilter.click()
  await expect(page.getByRole('option', { name: 'Tableau supprimé', exact: true })).toHaveCount(0)
})

test('avec un seul tableau, le filtre masqué après la restauration ne laisse pas la liste vide', async ({
  page,
  header,
  archivesPage,
}) => {
  const ancien = await createBoard(page.request, 'Ancien', 'orange', ['Idées'])
  await createArchived(page.request, ancien.stageIds[0], 'Ancienne idée de voyage')
  await createArchived(page.request, await defaultStageId(page.request), 'Migrer la base')
  expect((await page.request.delete(`${API}/boards/${ancien.id}`)).ok()).toBeTruthy()
  await page.reload()

  // Filtre affiché pour la seule tâche du tableau supprimé
  await header.goArchives()
  await archivesPage.filterByBoard('Tableau supprimé')
  await expect.poll(() => archivesPage.titleList()).toEqual(['Ancienne idée de voyage'])

  // Restaurée ici, plus de tableau supprimé : filtre masqué, toutes les archives affichées
  await archivesPage.restore('Ancienne idée de voyage')
  await expect(archivesPage.boardFilter).toHaveCount(0)
  await expect.poll(() => archivesPage.titleList()).toEqual(['Migrer la base'])
  await expect(archivesPage.count).toHaveText('1')
  await expect(archivesPage.noMatch).toHaveCount(0)
})

test('la tâche d’un tableau sans colonne se restaure dans le tableau affiché', async ({
  page,
  header,
  archivesPage,
}) => {
  const perso = await createBoard(page.request, 'Perso', 'emerald', ['Idées'])
  const id = await createArchived(page.request, perso.stageIds[0], 'Sans colonne')
  expect((await page.request.delete(`${API}/stages/${perso.stageIds[0]}`)).ok()).toBeTruthy()
  await page.reload()

  await header.goArchives()
  await archivesPage.restore('Sans colonne')

  await expect(archivesPage.item('Sans colonne')).toHaveCount(0)
  expect(await getTask(page.request, id)).toMatchObject({
    isHistorized: false,
    stageId: await defaultStageId(page.request),
    boardId: await defaultBoardId(page.request),
  })
})

test("sans colonne dans aucun tableau, la tâche reste archivée avec un message qui l'explique", async ({
  page,
  header,
  archivesPage,
}) => {
  const perso = await createBoard(page.request, 'Perso', 'emerald', ['Idées'])
  const id = await createArchived(page.request, perso.stageIds[0], 'Sans colonne')
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number }[]
  for (const stage of stages) {
    expect((await page.request.delete(`${API}/stages/${stage.id}`)).ok()).toBeTruthy()
  }
  await page.reload()

  await header.goArchives()
  await archivesPage.restore('Sans colonne')

  await expect(page.locator('.p-toast-message-error')).toContainText(
    'Aucun tableau n’a de colonne pour y restaurer la tâche.',
  )
  await expect(archivesPage.item('Sans colonne')).toBeVisible()
  expect(await getTask(page.request, id)).toMatchObject({ isHistorized: true, boardId: perso.id })
})

test('avec un seul tableau, ni filtre ni tableau sur les lignes', async ({ page, header, archivesPage }) => {
  await createArchived(page.request, await defaultStageId(page.request), 'Seule archive')

  await header.goArchives()
  await expect(archivesPage.item('Seule archive')).toBeVisible()
  await expect(archivesPage.boardFilter).toHaveCount(0)
  await expect(archivesPage.boardOf('Seule archive')).toHaveCount(0)
  await expect(archivesPage.restoreButton('Seule archive')).toHaveText('Restaurer')
})
