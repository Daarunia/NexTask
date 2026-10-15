import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de l'action « Archiver les tâches » du menu d'une colonne, soit
 * la confirmation avec le nombre de tâches, l'archivage de toute la colonne
 * (cartes masquées par un filtre comprises) et l'annulation qui remet chaque
 * carte à sa place.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonnes seedées (cf. prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'Terminé'
const OTHER_COLUMN = 'A faire'

/**
 * Crée des tâches dans une colonne, dans l'ordre donné, puis recharge le tableau.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 * @param titles Titres des tâches
 */
async function createTasks(request: APIRequestContext, column: string, titles: string[]) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  for (const [position, title] of titles.entries()) {
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

/**
 * Titres des tâches archivées, en base.
 * @param request Contexte de requête Playwright
 */
async function archivedTitles(request: APIRequestContext): Promise<string[]> {
  const tasks = (await (await request.get(`${API}/tasks`, { params: { isHistorized: true } })).json()) as {
    title: string
  }[]
  return tasks.map((task) => task.title).sort((a, b) => a.localeCompare(b))
}

test('archive toutes les tâches de la colonne après confirmation', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, ['Release 1.7', 'Release 1.8'])
  await createTasks(page.request, OTHER_COLUMN, ['Garder'])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Archiver les tâches' }).click()
  await expect(taskBoard.confirmPopup).toContainText('Archiver les 2 tâches de la liste « Terminé » ?')
  await taskBoard.confirmAcceptButton.click()

  await expect(taskBoard.column(COLUMN).getByTestId('task-card')).toHaveCount(0)
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('0')
  await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Garder'])
  await expect.poll(() => archivedTitles(page.request)).toEqual(['Release 1.7', 'Release 1.8'])
})

test('Annuler remet les cartes à leur place', async ({ page, taskBoard, undoToast }) => {
  await createTasks(page.request, COLUMN, ['Un', 'Deux', 'Trois'])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Archiver les tâches' }).click()
  await taskBoard.confirmAcceptButton.click()
  await expect(taskBoard.column(COLUMN).getByTestId('task-card')).toHaveCount(0)

  await expect(undoToast.toast(COLUMN)).toContainText('3 tâches archivées')
  await undoToast.undo(COLUMN)

  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Un', 'Deux', 'Trois'])
  await expect.poll(() => archivedTitles(page.request)).toEqual([])

  // Même ordre une fois le tableau relu en base
  await page.reload()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Un', 'Deux', 'Trois'])
})

test('Annuler sur la confirmation ne change rien', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, ['Un'])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Archiver les tâches' }).click()
  await expect(taskBoard.confirmPopup).toContainText('Archiver la tâche de la liste « Terminé » ?')
  await taskBoard.confirmRejectButton.click()

  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Un'])
  await expect.poll(() => archivedTitles(page.request)).toEqual([])
})

test('les cartes masquées par un filtre sont archivées aussi', async ({ page, taskBoard, tagFilter }) => {
  await createTasks(page.request, COLUMN, ['Visible', 'Masquée'])
  await page.reload()

  await tagFilter.search('visible')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Visible'])

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Archiver les tâches' }).click()
  await expect(taskBoard.confirmPopup).toContainText('Archiver les 2 tâches')
  await taskBoard.confirmAcceptButton.click()

  await expect.poll(() => archivedTitles(page.request)).toEqual(['Masquée', 'Visible'])
})

test("l'action est grisée sur une colonne vide", async ({ page, taskBoard }) => {
  await taskBoard.openStageMenu(COLUMN)
  await expect(page.getByRole('menuitem', { name: 'Archiver les tâches' })).toHaveAttribute('aria-disabled', 'true')
})
