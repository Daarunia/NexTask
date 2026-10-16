import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la duplication d'une tâche, soit la route
 * `POST /tasks/:id/duplicate` (copie sous l'originale, checklist décochée,
 * hors série) et le bouton « Dupliquer » du dialogue de tâche, qui propose
 * ensuite d'ouvrir la copie.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

const COLUMN = 'A faire'

interface ApiTask {
  id: number
  title: string
  version: string
  description: string
  position: number
  stageId: number | null
  startDate: string | null
  recurrenceId: number | null
  tags: { name: string }[]
  checklist: { items: { text: string; isChecked: boolean }[] } | null
}

/** Id de la colonne `COLUMN`. */
async function columnId(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  return stages.find((stage) => stage.name === COLUMN)!.id
}

/**
 * Crée une tâche dans la colonne `COLUMN`.
 * @param request Contexte de requête Playwright
 * @param title Titre
 * @param position Position dans la colonne
 * @param extra Champs ajoutés au corps
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  position: number,
  extra: Record<string, unknown> = {},
): Promise<ApiTask> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId: await columnId(request), position, title, version: '1.0.0', description: '', ...extra },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ApiTask
}

/**
 * Titres des tâches actives de la colonne, dans l'ordre des positions.
 * @param request Contexte de requête Playwright
 */
async function columnTitles(request: APIRequestContext): Promise<string[]> {
  const stageId = await columnId(request)
  const tasks = (await (await request.get(`${API}/tasks`)).json()) as ApiTask[]
  return tasks
    .filter((task) => task.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title)
}

test.describe('POST /tasks/:id/duplicate', () => {
  test.use({ ui: false })

  test('copie sous l’originale, avec ses tags, sa description et sa checklist décochée', async ({ request }) => {
    await createTask(request, 'Avant', 0)
    const source = await createTask(request, 'Courses', 1, {
      description: '**Liste** de la semaine',
      version: '2.0.0',
      startDate: '2026-11-02T08:00:00.000Z',
      tags: ['maison'],
      checklistItems: [
        { text: 'Pain', isChecked: true },
        { text: 'Café', isChecked: false },
      ],
    })
    await createTask(request, 'Après', 2)

    const res = await request.post(`${API}/tasks/${source.id}/duplicate`, { data: { title: 'Courses (copie)' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const copy = (await res.json()) as ApiTask

    expect(copy).toMatchObject({
      title: 'Courses (copie)',
      description: '**Liste** de la semaine',
      version: '2.0.0',
      startDate: '2026-11-02T08:00:00.000Z',
      stageId: source.stageId,
      position: 2,
      recurrenceId: null,
    })
    expect(copy.tags.map((tag) => tag.name)).toEqual(['maison'])
    expect(copy.checklist!.items.map((item) => [item.text, item.isChecked])).toEqual([
      ['Pain', false],
      ['Café', false],
    ])
    expect(await columnTitles(request)).toEqual(['Avant', 'Courses', 'Courses (copie)', 'Après'])
  })

  test('404 pour une tâche inconnue, 409 pour une tâche archivée', async ({ request }) => {
    const unknown = await request.post(`${API}/tasks/999999/duplicate`, { data: { title: 'X' } })
    expect(unknown.status()).toBe(404)

    const task = await createTask(request, 'Archivée', 0)
    expect((await request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    const archived = await request.post(`${API}/tasks/${task.id}/duplicate`, { data: { title: 'X' } })
    expect(archived.status()).toBe(409)
  })

  test('400 pour un titre vide', async ({ request }) => {
    const task = await createTask(request, 'Source', 0)
    const res = await request.post(`${API}/tasks/${task.id}/duplicate`, { data: { title: '  ' } })
    expect(res.status()).toBe(400)
  })
})

test.describe('bouton « Dupliquer » du dialogue', () => {
  test('la copie apparaît sous la carte, et le toast propose de l’ouvrir', async ({ page, taskBoard }) => {
    await createTask(page.request, 'Courses', 0, { checklistItems: [{ text: 'Pain', isChecked: true }] })
    await createTask(page.request, 'Ménage', 1)
    await page.reload()

    await taskBoard.openEditDialog('Courses')
    await page.getByTestId('task-duplicate-btn').click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Courses', 'Courses (copie)', 'Ménage'])
    await expect(taskBoard.cardChecklistBadge('Courses (copie)')).toHaveText('0/1')

    const toast = page.getByTestId('action-toast')
    await expect(toast.getByTestId('action-toast-summary')).toHaveText('Tâche dupliquée')
    await toast.getByTestId('btn-toast-action').click()
    await expect(taskBoard.dialog).toBeVisible()
    await expect(taskBoard.titleInput).toHaveValue('Courses (copie)')

    // Ordre enregistré, le même après rechargement
    await page.keyboard.press('Escape')
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Courses', 'Courses (copie)', 'Ménage'])
  })

  test('pas de bouton « Dupliquer » à la création', async ({ taskBoard, page }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await expect(page.getByTestId('task-archive-btn')).toHaveCount(0)
    await expect(page.getByTestId('task-duplicate-btn')).toHaveCount(0)
  })
})
