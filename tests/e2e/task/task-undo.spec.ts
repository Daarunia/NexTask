import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de l'annulation d'un archivage depuis le tableau : toast
 * « Annuler » affiché après l'archivage d'une carte, bouton ou Ctrl+Z pour
 * remettre la carte à sa place, archivage définitif à la fermeture du toast.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Colonnes seedées (cf. prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'

/** Tâche telle que renvoyée par l'API. */
type ApiTask = { id: number; title: string; position: number; stageId: number | null; isHistorized: boolean }

/**
 * Crée des tâches dans une colonne, dans l'ordre donné, puis recharge le tableau.
 * @param page Page de l'app
 * @param columnName Nom de la colonne
 * @param titles Titres, de haut en bas
 */
async function seedColumn(page: Page, columnName: string, titles: string[]) {
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === columnName)!.id

  for (const [position, title] of titles.entries()) {
    const res = await page.request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.5.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  await page.reload()
}

/** Tâche lue en base par son titre. */
async function findTask(request: APIRequestContext, title: string): Promise<ApiTask> {
  const tasks = (await (await request.get(`${API}/tasks`)).json()) as ApiTask[]
  return tasks.find((task) => task.title === title)!
}

test('archiver une carte affiche un toast « Annuler » avec son titre', async ({ page, taskBoard, undoToast }) => {
  await seedColumn(page, COLUMN, ['A', 'B'])

  await taskBoard.archiveTask('B')

  await expect(taskBoard.taskCard('B')).toHaveCount(0)
  await expect(undoToast.toast('B')).toBeVisible()
  await expect(undoToast.toast('B')).toContainText('Tâche archivée')
})

test('annuler remet la carte à sa place, au milieu de sa colonne', async ({ page, taskBoard, undoToast }) => {
  await seedColumn(page, COLUMN, ['A', 'B', 'C'])

  await taskBoard.archiveTask('B')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'C'])

  await undoToast.undo('B')

  await expect(undoToast.toast('B')).toHaveCount(0)
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'B', 'C'])
  expect(await findTask(page.request, 'B')).toMatchObject({ isHistorized: false, position: 1 })

  // Même ordre une fois le tableau relu en base
  await page.reload()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'B', 'C'])
})

test('Ctrl+Z annule le dernier archivage', async ({ page, taskBoard, undoToast }) => {
  await seedColumn(page, OTHER_COLUMN, ['Premier', 'Second'])

  await taskBoard.archiveTask('Premier')
  await taskBoard.archiveTask('Second')
  await expect(undoToast.toasts).toHaveCount(2)

  // Seul le plus récent est annulé
  await page.keyboard.press('Control+z')

  await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Second'])
  await expect(undoToast.toast('Second')).toHaveCount(0)
  await expect(undoToast.toast('Premier')).toBeVisible()
})

test("sans annulation, l'archivage reste acquis à la fermeture du toast", async ({ page, taskBoard, undoToast }) => {
  await seedColumn(page, COLUMN, ['A'])

  await taskBoard.archiveTask('A')
  await undoToast.waitForExpiry('A')

  await expect(taskBoard.taskCard('A')).toHaveCount(0)
  expect(await findTask(page.request, 'A')).toMatchObject({ isHistorized: true, stageId: null })
})

test('annuler après un déplacement de cartes garde un ordre cohérent', async ({ page, taskBoard, undoToast }) => {
  await seedColumn(page, COLUMN, ['A', 'B', 'C'])

  // A archivée, puis C remontée en tête : la place de A (0) est reprise par C
  await taskBoard.archiveTask('A')
  await taskBoard.dragTaskOntoCard('C', 'B', 'before')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['C', 'B'])

  await undoToast.undo('A')

  // A reprend la position 0, les autres descendent d'un cran
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'C', 'B'])
  await page.reload()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'C', 'B'])
})
