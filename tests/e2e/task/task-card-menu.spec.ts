import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { expectAnchoredTo } from '../../helpers/overlay.helper'

/**
 * Tests E2E du menu contextuel des cartes (clic droit ou touche Menu sur le
 * titre). Ouverture de la tâche, duplication, déplacement vers une autre
 * colonne (y compris sous filtre, où le glisser-déposer est désactivé), tout en
 * haut ou tout en bas de la colonne, et archivage.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'

interface ApiTask {
  title: string
  position: number
  stageId: number | null
  isHistorized: boolean
}

/**
 * Id d'une colonne par son nom.
 * @param request Contexte de requête Playwright
 * @param name Nom de la colonne
 */
async function columnId(request: APIRequestContext, name: string): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  return stages.find((stage) => stage.name === name)!.id
}

/**
 * Crée les tâches données, dans l'ordre, dans une colonne.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 * @param titles Titres des tâches
 */
async function createTasks(request: APIRequestContext, column: string, ...titles: string[]) {
  const stageId = await columnId(request, column)
  for (const [position, title] of titles.entries()) {
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

/**
 * Titres des tâches actives d'une colonne en base, dans l'ordre des positions.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 */
async function savedTitles(request: APIRequestContext, column: string): Promise<string[]> {
  const stageId = await columnId(request, column)
  const tasks = (await (await request.get(`${API}/tasks`)).json()) as ApiTask[]
  return tasks
    .filter((task) => task.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title)
}

test('le clic droit ouvre le menu, sans ouvrir la tâche', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Courses', 'Ménage')
  await page.reload()

  await taskBoard.openCardMenu('Courses')
  await expect(taskBoard.cardMenu.getByRole('menuitem')).toHaveText([
    'Ouvrir',
    'Dupliquer',
    'Déplacer vers',
    'Tout en haut',
    'Tout en bas',
    'Archiver',
  ])
  await expect(taskBoard.dialog).toBeHidden()

  // Déjà tout en haut
  await expect(taskBoard.cardMenuItem('Tout en haut')).toHaveAttribute('aria-disabled', 'true')
  await expect(taskBoard.cardMenuItem('Tout en bas')).not.toHaveAttribute('aria-disabled', 'true')

  await taskBoard.cardMenuItem('Ouvrir').click()
  await taskBoard.waitForDialogOpened()
  await expect(taskBoard.titleInput).toHaveValue('Courses')
})

test('la touche Menu sur le titre ouvre aussi le menu, Échap rend le focus au titre', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Courses')
  await page.reload()

  const title = taskBoard.taskCard('Courses').getByTestId('task-card-open')
  await title.focus()
  await page.keyboard.press('Shift+F10')

  // Focus placé dans le menu à la fin de son animation d'ouverture
  await expect(taskBoard.cardMenu.getByRole('menubar')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(taskBoard.cardMenu).toBeHidden()
  await expect(title).toBeFocused()
})

test('déplace une carte en bas d’une autre colonne', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Courses', 'Ménage')
  await createTasks(page.request, OTHER_COLUMN, 'Lessive')
  await page.reload()

  await taskBoard.moveCardTo('Courses', OTHER_COLUMN)

  expect(await taskBoard.columnTaskTitles(COLUMN)).toEqual(['Ménage'])
  expect(await taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Lessive', 'Courses'])
  await expect.poll(() => savedTitles(page.request, OTHER_COLUMN)).toEqual(['Lessive', 'Courses'])
  expect(await savedTitles(page.request, COLUMN)).toEqual(['Ménage'])
})

test('déplace une carte sous filtre, où le glisser-déposer est coupé', async ({ page, taskBoard, tagFilter }) => {
  await createTasks(page.request, COLUMN, 'Courses', 'Ménage')
  await page.reload()

  await tagFilter.search('Cour')
  // Liste des suggestions refermée, le filtre reste actif
  await tagFilter.input.press('Escape')
  await expect(taskBoard.taskCard('Ménage')).toHaveCount(0)

  await taskBoard.moveCardTo('Courses', OTHER_COLUMN)

  await expect(taskBoard.column(OTHER_COLUMN).getByTestId('task-card')).toHaveCount(1)
  await expect(taskBoard.columnCount(OTHER_COLUMN)).toHaveText('1/1')
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('0/1')
  await expect.poll(() => savedTitles(page.request, OTHER_COLUMN)).toEqual(['Courses'])
  expect(await savedTitles(page.request, COLUMN)).toEqual(['Ménage'])
})

test('monte et descend une carte tout en haut ou tout en bas de sa colonne', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Un', 'Deux', 'Trois')
  await page.reload()

  await taskBoard.openCardMenu('Trois')
  await expect(taskBoard.cardMenuItem('Tout en bas')).toHaveAttribute('aria-disabled', 'true')
  await taskBoard.cardMenuItem('Tout en haut').click()
  expect(await taskBoard.columnTaskTitles(COLUMN)).toEqual(['Trois', 'Un', 'Deux'])
  await expect.poll(() => savedTitles(page.request, COLUMN)).toEqual(['Trois', 'Un', 'Deux'])

  await taskBoard.openCardMenu('Un')
  await taskBoard.cardMenuItem('Tout en bas').click()
  expect(await taskBoard.columnTaskTitles(COLUMN)).toEqual(['Trois', 'Deux', 'Un'])
  await expect.poll(() => savedTitles(page.request, COLUMN)).toEqual(['Trois', 'Deux', 'Un'])
})

test('duplique une carte sous l’originale', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Courses', 'Ménage')
  await page.reload()

  await taskBoard.openCardMenu('Courses')
  await taskBoard.cardMenuItem('Dupliquer').click()

  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Courses', 'Courses (copie)', 'Ménage'])
})

test('archive une carte, après confirmation ancrée sur la carte si le réglage est actif', async ({
  page,
  header,
  taskBoard,
  settingsPage,
  undoToast,
}) => {
  await createTasks(page.request, COLUMN, 'Courses', 'Ménage')
  await page.reload()

  // Sans confirmation par défaut, annulable depuis le toast
  await taskBoard.openCardMenu('Courses')
  await taskBoard.cardMenuItem('Archiver').click()
  await expect(taskBoard.taskCard('Courses')).toHaveCount(0)
  await expect(undoToast.toast('Courses')).toContainText('Tâche archivée')

  await header.goSettings()
  await settingsPage.confirmArchiveSwitch.click()
  await expect(settingsPage.confirmArchiveSwitch).toBeChecked()
  await header.goHome()

  await taskBoard.openCardMenu('Ménage')
  await taskBoard.cardMenuItem('Archiver').click()
  await expect(taskBoard.confirmPopup).toBeVisible()
  await expectAnchoredTo(taskBoard.confirmPopup, taskBoard.taskCard('Ménage'))
  await taskBoard.confirmAcceptButton.click()
  await expect(taskBoard.taskCard('Ménage')).toHaveCount(0)

  const tasks = (await (await page.request.get(`${API}/tasks?isHistorized=true`)).json()) as ApiTask[]
  expect(tasks.map((task) => task.title).sort()).toEqual(['Courses', 'Ménage'])
})
