import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { expectAnchoredTo } from '../../helpers/overlay.helper'

/**
 * Tests E2E de la confirmation d'abandon du dialogue de tâche. Fermé par la
 * croix, Annuler ou Échap, un dialogue modifié demande d'abord s'il faut
 * abandonner la saisie ; un dialogue intact se ferme tout de suite.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

/**
 * Crée une tâche dans la colonne `COLUMN`.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param extra Champs ajoutés au corps
 */
async function createTask(request: APIRequestContext, title: string, extra: Record<string, unknown> = {}) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', ...extra },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

test('un dialogue intact se ferme sans confirmation', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses')
  await page.reload()

  await taskBoard.openEditDialog('Courses')
  await page.keyboard.press('Escape')
  await expect(taskBoard.dialog).toBeHidden()

  await taskBoard.openCreateDialog(COLUMN)
  await page.getByTestId('task-close-btn').click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.confirmPopup).toHaveCount(0)
})

test('une tâche complète, rouverte sans changement, se ferme sans confirmation', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Complète', {
    description: ['**Liste** de la semaine', '', '- pain', '- lait'].join('\n'),
    startDate: '2026-11-02T08:00:00.000Z',
    tags: ['maison', 'courses'],
    checklistItems: [
      { text: 'Pain', isChecked: true },
      { text: 'Lait', isChecked: false },
    ],
    recurrence: { frequency: 'weekly', interval: 1, weekdays: [1], endType: 'never', skipIfPending: true },
  })
  await page.reload()

  await taskBoard.openEditDialog('Complète')
  await page.keyboard.press('Escape')
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.confirmPopup).toHaveCount(0)
})

test('Annuler demande confirmation avant d’abandonner une saisie', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Courses')
  await page.reload()

  await taskBoard.openEditDialog('Courses')
  await taskBoard.titleInput.fill('Courses du samedi')
  await taskBoard.clickSettled(taskBoard.cancelButton)

  await expect(taskBoard.confirmPopup).toContainText('Abandonner les modifications non enregistrées ?')
  await expectAnchoredTo(taskBoard.confirmPopup, taskBoard.cancelButton)

  // Refus : la saisie reste
  await taskBoard.confirmRejectButton.click()
  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('Courses du samedi')

  // Abandon : le dialogue se ferme, rien n'est enregistré
  await taskBoard.clickSettled(taskBoard.cancelButton)
  await taskBoard.confirmAcceptButton.click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard('Courses')).toBeVisible()
  const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as { title: string }[]
  expect(tasks.map((task) => task.title)).toEqual(['Courses'])
})

test('Échap demande confirmation, un second Échap garde la saisie', async ({ page, taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.titleInput.fill('Nouvelle')

  await page.keyboard.press('Escape')
  await expect(taskBoard.confirmPopup).toBeVisible()
  await expectAnchoredTo(taskBoard.confirmPopup, taskBoard.cancelButton)

  await page.keyboard.press('Escape')
  await expect(taskBoard.confirmPopup).toBeHidden()
  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('Nouvelle')

  await page.keyboard.press('Escape')
  await taskBoard.confirmAcceptButton.click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard('Nouvelle')).toHaveCount(0)
})
