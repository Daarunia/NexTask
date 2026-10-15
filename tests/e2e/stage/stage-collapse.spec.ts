import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des colonnes repliées, soit le choix « Replier la liste » du menu
 * d'une colonne, la bande étroite qui la remplace (nom, compteur, clic qui la
 * déplie) et la mémorisation de l'état d'un lancement à l'autre.
 *
 * Isolation, la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const DONE_COLUMN = 'Terminé'

/**
 * Crée les tâches données, dans l'ordre, dans une colonne.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 * @param titles Titres des tâches
 */
async function createTasks(request: APIRequestContext, column: string, ...titles: string[]) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  for (const [position, title] of titles.entries()) {
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

test('replie une colonne depuis son menu, puis la déplie d’un clic', async ({ page, taskBoard }) => {
  await createTasks(page.request, DONE_COLUMN, 'Livrée', 'Rangée')
  await page.reload()

  await taskBoard.collapseStage(DONE_COLUMN)

  // Bande étroite : nom et compteur, sans les cartes
  const strip = taskBoard.collapsedColumn(DONE_COLUMN)
  await expect(strip.getByTestId('stage-strip-name')).toHaveText(DONE_COLUMN)
  await expect(strip.getByTestId('stage-count')).toHaveText('2')
  await expect(taskBoard.taskCard('Livrée')).toHaveCount(0)
  expect((await strip.boundingBox())!.width).toBeLessThan(80)

  // Mémorisée au rechargement
  await page.reload()
  await expect(taskBoard.collapsedColumn(DONE_COLUMN)).toHaveCount(1)

  await taskBoard.collapsedColumn(DONE_COLUMN).getByTestId('btn-stage-expand').click()
  await expect(taskBoard.column(DONE_COLUMN)).toHaveCount(1)
  await expect(taskBoard.taskCard('Livrée')).toBeVisible()

  await page.reload()
  await expect(taskBoard.column(DONE_COLUMN)).toHaveCount(1)
  await expect(taskBoard.collapsedColumn(DONE_COLUMN)).toHaveCount(0)
})

test('la bande suit le filtre et les cartes qui y arrivent', async ({ page, taskBoard, tagFilter }) => {
  await createTasks(page.request, COLUMN, 'Courses')
  await createTasks(page.request, DONE_COLUMN, 'Course livrée', 'Rangée')
  await page.reload()

  await taskBoard.collapseStage(DONE_COLUMN)
  const count = taskBoard.collapsedColumn(DONE_COLUMN).getByTestId('stage-count')

  await tagFilter.search('course')
  await tagFilter.input.press('Escape')
  await expect(count).toHaveText('1/2')

  // Carte envoyée dans la colonne repliée depuis son menu
  await taskBoard.moveCardTo('Courses', DONE_COLUMN)
  await expect(count).toHaveText('2/3')
  await expect(taskBoard.taskCard('Courses')).toHaveCount(0)
})
