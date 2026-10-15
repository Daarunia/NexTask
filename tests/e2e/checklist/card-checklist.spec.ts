import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { ChecklistItemInput } from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E des coches faites depuis la carte du tableau, sans ouvrir le
 * dialogue de tâche. Le badge de checklist ouvre une bulle avec les points,
 * chaque coche est enregistrée aussitôt par
 * `PATCH /tasks/:id/checklist/items/:itemId`, testée ici aussi.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

interface ChecklistItem {
  id: number
  text: string
  isChecked: boolean
  checkedAt: string | null
}

interface Task {
  id: number
  title: string
  updatedAt: string
  checklist: { id: number; items: ChecklistItem[] } | null
}

/**
 * Crée une tâche dans la colonne `COLUMN`, avec ses points.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param checklistItems Points de la checklist
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  checklistItems: ChecklistItemInput[],
): Promise<Task> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', checklistItems },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/**
 * Points non cochés, puis les `checked` premiers cochés.
 * @param texts Textes des points, dans l'ordre
 * @param checked Nombre de points cochés, en tête de liste
 */
function items(texts: string[], checked = 0): ChecklistItemInput[] {
  return texts.map((text, index) => ({ text, isChecked: index < checked }))
}

/**
 * Tâche telle qu'en base, lue par GET /tasks/:id.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 */
async function readTask(request: APIRequestContext, id: number): Promise<Task> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

test.describe('bulle de la carte', () => {
  test('coche un point depuis la carte et met le badge à jour', async ({ page, taskBoard }) => {
    const task = await createTask(page.request, 'Préparer la release', items(['Changelog', 'Tests', 'Tag'], 1))
    await page.reload()

    await taskBoard.cardChecklistButton('Préparer la release').click()
    await expect(taskBoard.cardChecklistPopover).toBeVisible()
    await expect(taskBoard.cardChecklistPopover).toContainText('Préparer la release')
    await expect(taskBoard.cardChecklistCheck('Changelog')).toBeChecked()
    await expect(taskBoard.cardChecklistCheck('Tests')).not.toBeChecked()

    await taskBoard.cardChecklistCheck('Tests').check()
    await expect(taskBoard.cardChecklistBadge('Préparer la release')).toHaveText('2/3')

    // Enregistré aussitôt, sans passer par le dialogue
    await expect
      .poll(async () => (await readTask(page.request, task.id)).checklist!.items.map((item) => item.isChecked))
      .toEqual([true, true, false])

    await taskBoard.cardChecklistCheck('Tag').check()
    await expect(taskBoard.cardChecklistBadge('Préparer la release')).toHaveText('3/3')
    await expect(taskBoard.cardChecklistBadge('Préparer la release')).toHaveClass(/\bdone\b/)

    // Le tableau rechargé garde les coches
    await page.reload()
    await expect(taskBoard.cardChecklistBadge('Préparer la release')).toHaveText('3/3')
  })

  test('décoche un point et le texte reste cliquable', async ({ page, taskBoard }) => {
    await createTask(page.request, 'Courses', items(['Pain', 'Café'], 2))
    await page.reload()

    await taskBoard.cardChecklistButton('Courses').click()
    // Un clic sur le texte du point coche ou décoche aussi
    await taskBoard.cardChecklistPopover.getByText('Café', { exact: true }).click()
    await expect(taskBoard.cardChecklistCheck('Café')).not.toBeChecked()
    await expect(taskBoard.cardChecklistBadge('Courses')).toHaveText('1/2')
  })

  test('Échap referme la bulle', async ({ page, taskBoard }) => {
    await createTask(page.request, 'Courses', items(['Pain']))
    await page.reload()

    await taskBoard.cardChecklistButton('Courses').click()
    await expect(taskBoard.cardChecklistPopover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(taskBoard.cardChecklistPopover).toBeHidden()
  })

  test('« Ouvrir la tâche » ouvre le dialogue avec les coches à jour', async ({ page, taskBoard, taskChecklist }) => {
    await createTask(page.request, 'Courses', items(['Pain', 'Café']))
    await page.reload()

    await taskBoard.cardChecklistButton('Courses').click()
    await taskBoard.cardChecklistCheck('Pain').check()
    await expect(taskBoard.cardChecklistBadge('Courses')).toHaveText('1/2')

    await taskBoard.cardChecklistPopover.getByTestId('btn-card-checklist-open').click()
    await expect(taskBoard.cardChecklistPopover).toBeHidden()
    await expect(taskBoard.dialog).toBeVisible()
    await expect(taskBoard.titleInput).toHaveValue('Courses')
    await expect.poll(() => taskChecklist.checkedStates()).toEqual([true, false])
  })
})

test.describe('checklist terminée depuis la carte', () => {
  test("le dernier point coché propose d'archiver la tâche", async ({ page, taskBoard }) => {
    await createTask(page.request, 'Courses', items(['Pain', 'Café'], 1))
    await page.reload()

    const toast = page.getByTestId('action-toast')
    await taskBoard.cardChecklistButton('Courses').click()
    await taskBoard.cardChecklistCheck('Café').check()

    await expect(toast).toBeVisible()
    await expect(toast.getByTestId('action-toast-summary')).toHaveText('Checklist terminée')
    await expect(toast.getByTestId('action-toast-detail')).toHaveText('Courses')

    await toast.getByTestId('btn-toast-action').click()
    await expect(taskBoard.taskCard('Courses')).toHaveCount(0)
    // Archivage habituel, donc annulable
    await expect(page.getByTestId('undo-toast')).toBeVisible()
  })

  test("aucune proposition tant qu'un point reste à cocher", async ({ page, taskBoard }) => {
    await createTask(page.request, 'Courses', items(['Pain', 'Café', 'Lait']))
    await page.reload()

    await taskBoard.cardChecklistButton('Courses').click()
    await taskBoard.cardChecklistCheck('Pain').check()
    await expect(taskBoard.cardChecklistBadge('Courses')).toHaveText('1/3')
    await expect(page.getByTestId('action-toast')).toHaveCount(0)
  })
})

test.describe('PATCH /tasks/:id/checklist/items/:itemId', () => {
  test.use({ ui: false })

  test('coche puis décoche un point, date de coche fixée par le serveur', async ({ request }) => {
    const task = await createTask(request, 'API', items(['Un', 'Deux']))
    const [first, second] = task.checklist!.items

    const checked = await request.patch(`${API}/tasks/${task.id}/checklist/items/${second.id}`, {
      data: { isChecked: true },
    })
    expect(checked.ok(), await checked.text()).toBeTruthy()
    const afterCheck = (await checked.json()) as Task
    expect(afterCheck.checklist!.items.map((item) => item.isChecked)).toEqual([false, true])
    expect(afterCheck.checklist!.items[1].checkedAt).not.toBeNull()
    // Les autres points ne bougent pas
    expect(afterCheck.checklist!.items[0]).toEqual(first)

    // Recocher un point déjà coché garde sa date de coche
    const again = await request.patch(`${API}/tasks/${task.id}/checklist/items/${second.id}`, {
      data: { isChecked: true },
    })
    expect(((await again.json()) as Task).checklist!.items[1].checkedAt).toBe(afterCheck.checklist!.items[1].checkedAt)

    const unchecked = await request.patch(`${API}/tasks/${task.id}/checklist/items/${second.id}`, {
      data: { isChecked: false },
    })
    expect(unchecked.ok()).toBeTruthy()
    expect(((await unchecked.json()) as Task).checklist!.items[1]).toMatchObject({ isChecked: false, checkedAt: null })
  })

  test("404 pour un point d'une autre tâche ou une tâche inconnue", async ({ request }) => {
    const task = await createTask(request, 'Avec point', items(['Un']))
    const other = await createTask(request, 'Autre', items(['Deux']))
    const otherItemId = other.checklist!.items[0].id

    const foreign = await request.patch(`${API}/tasks/${task.id}/checklist/items/${otherItemId}`, {
      data: { isChecked: true },
    })
    expect(foreign.status()).toBe(404)
    expect((await readTask(request, other.id)).checklist!.items[0].isChecked).toBe(false)

    const unknown = await request.patch(`${API}/tasks/999999/checklist/items/${otherItemId}`, {
      data: { isChecked: true },
    })
    expect(unknown.status()).toBe(404)
  })

  test('400 sans isChecked', async ({ request }) => {
    const task = await createTask(request, 'Avec point', items(['Un']))
    const res = await request.patch(`${API}/tasks/${task.id}/checklist/items/${task.checklist!.items[0].id}`, {
      data: {},
    })
    expect(res.status()).toBe(400)
  })
})
