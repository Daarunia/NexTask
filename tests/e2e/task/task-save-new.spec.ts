import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de « Enregistrer et nouvelle » (bouton ou Ctrl+Maj+Entrée) dans le
 * dialogue de création : la tâche est enregistrée et le dialogue reste ouvert,
 * vide, pour la suivante, placée après elle dans la colonne.
 *
 * Isolation, la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

/**
 * Titres des tâches actives de la colonne en base, dans l'ordre des positions.
 * @param request Contexte de requête Playwright
 */
async function savedTitles(request: APIRequestContext): Promise<string[]> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id
  const tasks = (await (await request.get(`${API}/tasks`)).json()) as {
    title: string
    position: number
    stageId: number
  }[]
  return tasks
    .filter((task) => task.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title)
}

test('enchaîne trois créations dans la colonne, dans l’ordre', async ({ page, taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  const saveAndNew = page.getByTestId('task-save-new-btn')

  await taskBoard.titleInput.fill('Un')
  await saveAndNew.click()

  // Dialogue resté ouvert, vide, titre prêt à la saisie
  await expect(taskBoard.taskCard('Un')).toBeVisible()
  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('')
  await expect(taskBoard.titleInput).toBeFocused()

  await page.keyboard.type('Deux')
  await page.keyboard.press('Control+Shift+Enter')
  await expect(taskBoard.taskCard('Deux')).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('')

  await page.keyboard.type('Trois')
  await taskBoard.saveButton.click()
  await expect(taskBoard.dialog).toBeHidden()

  expect(await taskBoard.columnTaskTitles(COLUMN)).toEqual(['Un', 'Deux', 'Trois'])
  expect(await savedTitles(page.request)).toEqual(['Un', 'Deux', 'Trois'])
})

test('un titre vide bloque l’enchaînement', async ({ page, taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await page.getByTestId('task-save-new-btn').click()

  await expect(taskBoard.titleError).toBeVisible()
  await expect(taskBoard.dialog).toBeVisible()
  expect(await savedTitles(page.request)).toEqual([])
})

test('absent en modification', async ({ page, taskBoard }) => {
  await taskBoard.createTask(COLUMN, { title: 'Existante' })
  await taskBoard.openEditDialog('Existante')

  await expect(page.getByTestId('task-save-new-btn')).toHaveCount(0)
})
