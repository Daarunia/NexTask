import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du raccourci N, qui ouvre le dialogue de création d'une tâche dans
 * la colonne qui a le focus, sinon dans la première colonne dépliée. Il ne
 * réagit pas pendant une saisie.
 *
 * Isolation, la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'

/**
 * Crée une tâche dans une colonne.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 * @param title Titre de la tâche
 */
async function createTask(request: APIRequestContext, column: string, title: string) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

test('N ouvre une nouvelle tâche dans la première colonne', async ({ page, taskBoard }) => {
  await page.keyboard.press('n')

  await taskBoard.waitForDialogOpened()
  await expect(page.getByTestId('task-dialog-heading')).toHaveText(`Nouvelle tâche · ${COLUMN}`)
  // Le titre reste vide, la touche n'y est pas tapée
  await expect(taskBoard.titleInput).toHaveValue('')
})

test('N vise la colonne de la carte qui a le focus', async ({ page, taskBoard }) => {
  await createTask(page.request, OTHER_COLUMN, 'Lessive')
  await page.reload()

  await taskBoard.taskCard('Lessive').getByTestId('task-card-open').focus()
  await page.keyboard.press('n')

  await taskBoard.waitForDialogOpened()
  await expect(page.getByTestId('task-dialog-heading')).toHaveText(`Nouvelle tâche · ${OTHER_COLUMN}`)
})

test('N saute les colonnes repliées', async ({ page, taskBoard }) => {
  await taskBoard.collapseStage(COLUMN)
  await page.locator('body').click({ position: { x: 5, y: 5 } })

  await page.keyboard.press('n')

  await taskBoard.waitForDialogOpened()
  await expect(page.getByTestId('task-dialog-heading')).toHaveText(`Nouvelle tâche · ${OTHER_COLUMN}`)
})

test('N tapé dans la recherche reste du texte', async ({ page, taskBoard, tagFilter }) => {
  await tagFilter.input.click()
  await page.keyboard.press('n')

  await expect(tagFilter.input).toHaveValue('n')
  await expect(taskBoard.dialog).toBeHidden()
})
