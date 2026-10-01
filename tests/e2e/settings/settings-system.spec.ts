import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des réglages Notifications de la page Paramètres. Les rappels sont
 * observés via le passage manuel du planificateur (POST /test/run-notifications).
 */

const DAY = 24 * 60 * 60 * 1000

/** Crée une tâche dont la date de début est passée, et renvoie son id. */
async function createOverdueTask(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number }[]
  const res = await request.post(`${API}/tasks`, {
    data: {
      stageId: stages[0].id,
      position: 0,
      title: 'Échue',
      version: '1.5.0',
      description: '',
      startDate: new Date(Date.now() - DAY).toISOString(),
    },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: number }).id
}

test.describe('Notifications', () => {
  test('les rappels sont activés par défaut', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.notificationsSwitch).toBeChecked()
  })

  test('rappels désactivés : la tâche échue est marquée sans notification', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.notificationsSwitch.click()
    await expect(settingsPage.notificationsSwitch).not.toBeChecked()

    const id = await createOverdueTask(page.request)
    const res = await page.request.post(`${API}/test/run-notifications`, { data: {} })
    expect(await res.json()).toEqual({ count: 1, shown: false })

    // Marquée quand même : elle ne ressortira pas à la réactivation
    const task = (await (await page.request.get(`${API}/tasks/${id}`)).json()) as { notifiedAt: string | null }
    expect(task.notifiedAt).toBeTruthy()
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.notificationsSwitch.click()
    await expect(settingsPage.notificationsSwitch).not.toBeChecked()

    await page.reload()

    await expect(settingsPage.notificationsSwitch).not.toBeChecked()
  })
})
