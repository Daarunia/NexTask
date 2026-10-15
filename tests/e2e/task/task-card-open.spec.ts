import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de l'ouverture d'une tâche depuis sa carte, d'un clic n'importe où
 * sur la carte ou d'Entrée sur son titre. Les éléments du pied de carte (badge
 * de checklist, croix d'un tag) gardent leur propre action, et un clic qui
 * termine un glisser-déposer n'ouvre rien.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'

/**
 * Crée une tâche dans une colonne.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param position Position dans la colonne
 * @param extra Champs ajoutés au corps
 * @param column Nom de la colonne
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  position: number,
  extra: Record<string, unknown> = {},
  column = COLUMN,
) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position, title, version: '1.0.0', description: '', ...extra },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

test('un clic sur la carte ouvre la tâche', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses', 0, { tags: ['maison'] })
  await page.reload()

  // Coin bas droit, loin du titre : la zone de clic couvre toute la carte
  const card = taskBoard.taskCard('Courses')
  const box = (await card.boundingBox())!
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 6)

  await taskBoard.waitForDialogOpened()
  await expect(page.getByTestId('task-dialog-heading')).toContainText('Modifier la tâche')
  await expect(taskBoard.titleInput).toHaveValue('Courses')
  // Jour de création dans l'en-tête, créée à l'instant par l'API
  const today = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())
  await expect(page.getByTestId('task-dialog-created')).toHaveText(`créée le ${today}`)
})

test('Entrée sur le titre de la carte ouvre la tâche', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses', 0)
  await page.reload()

  await taskBoard.taskCard('Courses').getByTestId('task-card-open').focus()
  await page.keyboard.press('Enter')

  await taskBoard.waitForDialogOpened()
  await expect(taskBoard.titleInput).toHaveValue('Courses')
})

test('le badge de checklist et la croix d’un tag gardent leur action', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses', 0, {
    tags: ['maison'],
    checklistItems: [{ text: 'Pain', isChecked: false }],
  })
  await page.reload()

  await taskBoard.taskCard('Courses').getByTestId('btn-card-checklist').click()
  await expect(taskBoard.cardChecklistPopover).toBeVisible()
  await expect(taskBoard.dialog).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(taskBoard.cardChecklistPopover).toBeHidden()

  await taskBoard.removeCardTag('Courses', 'maison')
  await expect(taskBoard.taskCardTags('Courses')).toHaveCount(0)
  await expect(taskBoard.dialog).toBeHidden()
})

test('un glisser-déposer n’ouvre pas la tâche', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses', 0)
  await createTask(page.request, 'Ménage', 0, {}, OTHER_COLUMN)
  await page.reload()

  await taskBoard.dragTaskToColumnEnd('Courses', OTHER_COLUMN)

  await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Ménage', 'Courses'])
  await expect(taskBoard.dialog).toBeHidden()
})
