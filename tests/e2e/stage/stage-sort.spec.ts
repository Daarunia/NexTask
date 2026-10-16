import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de l'action « Trier par date de début » du menu d'une colonne,
 * soit le tri enregistré (tâches sans date en bas) et son annulation. L'ordre
 * du tri lui-même est couvert par tests/unit/date.spec.ts.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

const COLUMN = 'A faire'

/**
 * Crée des tâches dans la colonne `COLUMN`, dans l'ordre donné.
 * @param request Contexte de requête Playwright
 * @param tasks Titres et dates de début (en jours depuis aujourd'hui, null sans date)
 */
async function createTasks(request: APIRequestContext, tasks: [string, number | null][]) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id
  for (const [position, [title, days]] of tasks.entries()) {
    let startDate: string | null = null
    if (days !== null) {
      const date = new Date()
      date.setDate(date.getDate() + days)
      date.setHours(9, 0, 0, 0)
      startDate = date.toISOString()
    }
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '', startDate },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

test('trie la colonne par date de début et enregistre le nouvel ordre', async ({ page, taskBoard, undoToast }) => {
  await createTasks(page.request, [
    ['Sans date', null],
    ['Dans une semaine', 7],
    ['Demain', 1],
    ['Hier', -1],
  ])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Trier par date de début' }).click()

  const sorted = ['Hier', 'Demain', 'Dans une semaine', 'Sans date']
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(sorted)
  await expect(undoToast.toast(COLUMN)).toContainText('Liste triée par date')

  await page.reload()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(sorted)
})

test("Annuler rend l'ordre d'avant le tri", async ({ page, taskBoard, undoToast }) => {
  const before = ['Sans date', 'Dans une semaine', 'Demain']
  await createTasks(page.request, [
    ['Sans date', null],
    ['Dans une semaine', 7],
    ['Demain', 1],
  ])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Trier par date de début' }).click()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Demain', 'Dans une semaine', 'Sans date'])

  await undoToast.undo(COLUMN)
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(before)

  await page.reload()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(before)
})

test("l'action est grisée sans aucune date dans la colonne", async ({ page, taskBoard }) => {
  await createTasks(page.request, [['Sans date', null]])
  await page.reload()

  await taskBoard.openStageMenu(COLUMN)
  await expect(page.getByRole('menuitem', { name: 'Trier par date de début' })).toHaveAttribute('aria-disabled', 'true')
})
